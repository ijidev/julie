<?php

declare(strict_types=1);

namespace Wayfairs\Services;

use Wayfairs\Core\Config;
use Wayfairs\Core\Context;
use Wayfairs\Core\Database;
use Wayfairs\Core\Money;
use Wayfairs\Core\Security;

final class BankingService
{
    public function __construct(public readonly Database $database, public readonly LedgerService $ledger)
    {
    }

    public function assetByCode(string $code): array
    {
        $asset = $this->database->fetchOne('SELECT * FROM assets WHERE code = ? AND enabled = 1', [strtoupper(trim($code))]);
        if (!$asset) {
            throw new \RuntimeException('That asset is not available.');
        }
        return $asset;
    }

    public function accountFor(string $userId, string $assetCode): array
    {
        $asset = $this->assetByCode($assetCode);
        $account = $this->database->fetchOne(
            'SELECT a.*, la.code AS ledger_code FROM accounts a JOIN ledger_accounts la ON la.id = a.ledger_account_id WHERE a.user_id = ? AND a.asset_id = ?',
            [$userId, $asset['id']]
        ) ?? $this->createAccount($userId, $asset);
        return $account + ['asset' => $asset];
    }

    public function allAccounts(string $userId): array
    {
        $accounts = [];
        foreach ($this->database->fetchAll('SELECT code FROM assets WHERE enabled = 1 ORDER BY asset_type, code') as $asset) {
            $accounts[] = $this->accountFor($userId, (string) $asset['code']);
        }
        return $accounts;
    }

    public function submitDeposit(string $userId, string $assetCode, string $amount, string $senderReference, string $idempotencyToken): array
    {
        $account = $this->accountFor($userId, $assetCode);
        $asset = $account['asset'];
        $this->guard($userId, $account, (string) $asset['asset_type'] === 'crypto' ? 'crypto_deposit' : 'fiat_deposit');
        if (!(int) $asset['deposit_enabled']) {
            throw new \RuntimeException('Deposits are not open for this asset.');
        }
        $minor = $this->positiveAmount($amount, (int) $asset['scale']);
        if ($minor < (int) $asset['min_deposit_minor']) {
            throw new \RuntimeException('Deposit is below the minimum for this asset.');
        }
        $entryId = $this->ledger->createEntry('deposit', 'Deposit request', $userId, $this->idempotencyKey('deposit', $userId, $idempotencyToken));
        $existing = $this->database->fetchOne('SELECT * FROM deposit_requests WHERE journal_entry_id = ?', [$entryId]);
        if ($existing) {
            return $existing;
        }
        $depositId = Security::uuid();
        $transactionId = Security::uuid();
        $this->database->transaction(function (Database $db) use ($userId, $account, $asset, $minor, $senderReference, $entryId, $depositId, $transactionId): void {
            $db->execute(
                'INSERT INTO transactions (id, user_id, account_id, journal_entry_id, public_reference, transaction_type, direction, amount_minor, fee_minor, status, description, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [$transactionId, $userId, $account['id'], $entryId, Security::reference('DEP'), 'deposit', 'credit', $minor, 0, 'pending', 'Deposit awaiting verification', json_encode(['sender_reference' => trim($senderReference)], JSON_THROW_ON_ERROR)]
            );
            $db->execute(
                'INSERT INTO deposit_requests (id, user_id, account_id, transaction_id, deposit_type, amount_minor, sender_reference, status, journal_entry_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [$depositId, $userId, $account['id'], $transactionId, (string) $asset['asset_type'] === 'crypto' ? 'crypto' : 'fiat', $minor, trim($senderReference) ?: null, 'pending', $entryId]
            );
        });
        return $this->database->fetchOne('SELECT * FROM deposit_requests WHERE id = ?', [$depositId]);
    }

    public function verifyDeposit(string $depositId, string $adminId, bool $approve, string $reason, ?string $externalReference): void
    {
        $this->assertNotImpersonating('Deposit decisions');
        $deposit = $this->database->fetchOne('SELECT * FROM deposit_requests WHERE id = ?', [$depositId]);
        if (!$deposit || $deposit['status'] !== 'pending') {
            throw new \RuntimeException('This deposit is no longer pending.');
        }
        $account = $this->database->fetchOne('SELECT * FROM accounts WHERE id = ?', [(string) $deposit['account_id']]);
        $this->database->transaction(function (Database $db) use ($deposit, $account, $adminId, $approve, $reason, $externalReference): void {
            if ($approve) {
                $this->ledger->post([
                    ['ledger_account_id' => $this->systemAccountId((string) $account['asset_id'], 'asset'), 'side' => 'debit', 'amount_minor' => (int) $deposit['amount_minor']],
                    ['ledger_account_id' => (string) $account['ledger_account_id'], 'side' => 'credit', 'amount_minor' => (int) $deposit['amount_minor']],
                ], $adminId, (string) $deposit['journal_entry_id']);
                $db->execute("UPDATE transactions SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?", [$this->now(), $this->now(), (string) $deposit['transaction_id']]);
                $db->execute("UPDATE deposit_requests SET status = 'completed', reviewed_by = ?, reviewed_at = ?, review_reason = ?, external_reference = ?, updated_at = ? WHERE id = ?", [$adminId, $this->now(), $reason, $externalReference ?: null, $this->now(), (string) $deposit['id']]);
                return;
            }
            $db->execute("UPDATE transactions SET status = 'failed', updated_at = ? WHERE id = ?", [$this->now(), (string) $deposit['transaction_id']]);
            $db->execute("UPDATE deposit_requests SET status = 'rejected', reviewed_by = ?, reviewed_at = ?, review_reason = ?, updated_at = ? WHERE id = ?", [$adminId, $this->now(), $reason, $this->now(), (string) $deposit['id']]);
        });
    }

    public function submitWithdrawal(string $userId, string $assetCode, string $amount, array $destination, string $idempotencyToken): array
    {
        $account = $this->accountFor($userId, $assetCode);
        $asset = $account['asset'];
        $this->guard($userId, $account, (string) $asset['asset_type'] === 'crypto' ? 'crypto_withdrawal' : 'fiat_withdrawal');
        if (!(int) $asset['withdrawal_enabled']) {
            throw new \RuntimeException('Withdrawals are not open for this asset.');
        }
        $isCrypto = (string) $asset['asset_type'] === 'crypto';
        $requiredFields = $isCrypto ? ['network', 'address'] : ['bank_name', 'account_number'];
        foreach ($requiredFields as $field) {
            if (trim((string) ($destination[$field] ?? '')) === '') {
                throw new \RuntimeException('Complete the ' . ($isCrypto ? 'wallet' : 'bank') . ' destination details.');
            }
        }
        $destination = array_intersect_key(
            $destination,
            array_flip($isCrypto ? ['network', 'address', 'memo'] : ['bank_name', 'account_name', 'account_number', 'routing', 'swift'])
        );
        $amountMinor = $this->positiveAmount($amount, (int) $asset['scale']);
        if ($amountMinor < (int) $asset['min_withdrawal_minor']) {
            throw new \RuntimeException('Withdrawal is below the minimum for this asset.');
        }
        $fee = (int) $asset['withdrawal_fee_minor'];
        $total = $amountMinor + $fee;
        if ($this->ledger->accountBalance($account['id']) < $total) {
            throw new \RuntimeException('Insufficient available balance for this withdrawal and its fee.');
        }
        $entryId = $this->ledger->createEntry('withdrawal', 'Withdrawal request', $userId, $this->idempotencyKey('withdrawal', $userId, $idempotencyToken));
        $existing = $this->database->fetchOne('SELECT * FROM withdrawal_requests WHERE journal_entry_id = ?', [$entryId]);
        if ($existing) {
            return $existing;
        }
        $withdrawalId = Security::uuid();
        $holdId = Security::uuid();
        $transactionId = Security::uuid();
        $encrypted = Security::encrypt($destination, (string) Config::instance()->get('app_key', ''));
        $summary = $this->destinationSummary($destination);
        $this->database->transaction(function (Database $db) use ($userId, $account, $amountMinor, $fee, $total, $withdrawalId, $holdId, $transactionId, $entryId, $encrypted, $summary, $asset): void {
            $db->execute(
                'INSERT INTO transactions (id, user_id, account_id, journal_entry_id, public_reference, transaction_type, direction, amount_minor, fee_minor, status, description, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [$transactionId, $userId, $account['id'], $entryId, Security::reference('WDR'), 'withdrawal', 'debit', $amountMinor, $fee, 'pending', 'Withdrawal awaiting completion', '{}']
            );
            $db->execute('INSERT INTO holds (id, account_id, source_type, source_id, amount_minor) VALUES (?, ?, ?, ?, ?)', [$holdId, $account['id'], 'withdrawal', $withdrawalId, $total]);
            $db->execute(
                'INSERT INTO withdrawal_requests (id, user_id, account_id, transaction_id, hold_id, withdrawal_type, amount_minor, fee_minor, destination_ciphertext, destination_summary, status, journal_entry_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [$withdrawalId, $userId, $account['id'], $transactionId, $holdId, (string) $asset['asset_type'] === 'crypto' ? 'crypto' : 'fiat', $amountMinor, $fee, $encrypted, $summary, 'pending', $entryId]
            );
        });
        return $this->database->fetchOne('SELECT * FROM withdrawal_requests WHERE id = ?', [$withdrawalId]);
    }

    public function approveWithdrawal(string $withdrawalId, string $adminId, bool $approve, string $reason, ?string $externalReference): void
    {
        $this->assertNotImpersonating('Withdrawal decisions');
        $request = $this->database->fetchOne('SELECT * FROM withdrawal_requests WHERE id = ?', [$withdrawalId]);
        if (!$request || !in_array((string) $request['status'], ['pending', 'approved'], true)) {
            throw new \RuntimeException('This withdrawal is no longer actionable.');
        }
        $account = $this->database->fetchOne('SELECT * FROM accounts WHERE id = ?', [(string) $request['account_id']]);
        $this->database->transaction(function (Database $db) use ($request, $account, $adminId, $approve, $reason, $externalReference): void {
            if ($approve) {
                $amount = (int) $request['amount_minor'];
                $fee = (int) $request['fee_minor'];
                $this->ledger->post([
                    ['ledger_account_id' => (string) $account['ledger_account_id'], 'side' => 'debit', 'amount_minor' => $amount],
                    ['ledger_account_id' => $this->systemAccountId((string) $account['asset_id'], 'asset'), 'side' => 'credit', 'amount_minor' => $amount],
                ], $adminId, (string) $request['journal_entry_id']);
                if ($fee > 0) {
                    $feeEntry = $this->ledger->createEntry('fee', 'Withdrawal fee', $adminId);
                    $this->ledger->post([
                        ['ledger_account_id' => (string) $account['ledger_account_id'], 'side' => 'debit', 'amount_minor' => $fee],
                        ['ledger_account_id' => $this->systemAccountId((string) $account['asset_id'], 'revenue'), 'side' => 'credit', 'amount_minor' => $fee],
                    ], $adminId, $feeEntry);
                }
                $db->execute("UPDATE holds SET status = 'captured', released_at = ? WHERE id = ?", [$this->now(), (string) $request['hold_id']]);
                $db->execute("UPDATE transactions SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?", [$this->now(), $this->now(), (string) $request['transaction_id']]);
                $db->execute("UPDATE withdrawal_requests SET status = 'completed', reviewed_by = ?, reviewed_at = ?, review_reason = ?, external_reference = ?, updated_at = ? WHERE id = ?", [$adminId, $this->now(), $reason, $externalReference ?: null, $this->now(), (string) $request['id']]);
                return;
            }
            $db->execute("UPDATE holds SET status = 'released', released_at = ? WHERE id = ?", [$this->now(), (string) $request['hold_id']]);
            $db->execute("UPDATE transactions SET status = 'failed', updated_at = ? WHERE id = ?", [$this->now(), (string) $request['transaction_id']]);
            $db->execute("UPDATE withdrawal_requests SET status = 'rejected', reviewed_by = ?, reviewed_at = ?, review_reason = ?, updated_at = ? WHERE id = ?", [$adminId, $this->now(), $reason, $this->now(), (string) $request['id']]);
        });
    }

    public function internalTransfer(string $senderId, string $recipientEmail, string $assetCode, string $amount, ?string $note, string $idempotencyToken): array
    {
        $senderAccount = $this->accountFor($senderId, $assetCode);
        $this->guard($senderId, $senderAccount, 'internal_transfer');
        $asset = $senderAccount['asset'];
        $recipient = $this->database->fetchOne('SELECT * FROM users WHERE email_normalized = ?', [mb_strtolower(trim($recipientEmail), 'UTF-8')]);
        if (!$recipient || $recipient['status'] !== 'active') {
            throw new \RuntimeException('The recipient account is not available.');
        }
        if ((string) $recipient['id'] === $senderId) {
            throw new \RuntimeException('You cannot send money to your own account.');
        }
        $recipientAccount = $this->accountFor((string) $recipient['id'], $assetCode);
        $amountMinor = $this->positiveAmount($amount, (int) $asset['scale']);
        $fee = (int) $asset['transfer_fee_minor'];
        if ($this->ledger->accountBalance($senderAccount['id']) < $amountMinor + $fee) {
            throw new \RuntimeException('Insufficient available balance for this transfer.');
        }
        $entryId = $this->ledger->createEntry('transfer', 'Internal transfer', $senderId, $this->idempotencyKey('transfer', $senderId, $idempotencyToken));
        $existing = $this->database->fetchOne('SELECT * FROM transfers WHERE journal_entry_id = ?', [$entryId]);
        if ($existing) {
            return $existing;
        }
        $transferId = Security::uuid();
        $senderTransactionId = Security::uuid();
        $recipientTransactionId = Security::uuid();
        $note = trim((string) $note) ?: null;
        $this->database->transaction(function (Database $db) use ($senderId, $senderAccount, $recipient, $recipientAccount, $asset, $amountMinor, $fee, $entryId, $transferId, $senderTransactionId, $recipientTransactionId, $note): void {
            $postings = [
                ['ledger_account_id' => (string) $senderAccount['ledger_account_id'], 'side' => 'debit', 'amount_minor' => $amountMinor],
                ['ledger_account_id' => (string) $recipientAccount['ledger_account_id'], 'side' => 'credit', 'amount_minor' => $amountMinor],
            ];
            if ($fee > 0) {
                $postings[] = ['ledger_account_id' => (string) $senderAccount['ledger_account_id'], 'side' => 'debit', 'amount_minor' => $fee];
                $postings[] = ['ledger_account_id' => $this->systemAccountId((string) $asset['id'], 'revenue'), 'side' => 'credit', 'amount_minor' => $fee];
            }
            $this->ledger->post($postings, $senderId, $entryId);
            $db->execute(
                'INSERT INTO transfers (id, public_reference, sender_user_id, sender_account_id, recipient_user_id, recipient_account_id, asset_id, amount_minor, fee_minor, note, status, journal_entry_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [$transferId, Security::reference('TRF'), $senderId, $senderAccount['id'], $recipient['id'], $recipientAccount['id'], $asset['id'], $amountMinor, $fee, $note, 'completed', $entryId]
            );
            $db->execute(
                'INSERT INTO transactions (id, user_id, account_id, journal_entry_id, public_reference, transaction_type, direction, amount_minor, fee_minor, status, counterparty_label, description, metadata, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [$senderTransactionId, $senderId, $senderAccount['id'], $entryId, Security::reference('TRF'), 'transfer_out', 'debit', $amountMinor, $fee, 'completed', (string) $recipient['email_normalized'], $note ?? 'Transfer sent', json_encode(['transfer_id' => $transferId], JSON_THROW_ON_ERROR), $this->now()]
            );
            $db->execute(
                'INSERT INTO transactions (id, user_id, account_id, journal_entry_id, public_reference, transaction_type, direction, amount_minor, fee_minor, status, counterparty_label, description, metadata, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [$recipientTransactionId, (string) $recipient['id'], $recipientAccount['id'], $entryId, Security::reference('TRF'), 'transfer_in', 'credit', $amountMinor, 0, 'completed', $senderId, $note ?? 'Transfer received', json_encode(['transfer_id' => $transferId], JSON_THROW_ON_ERROR), $this->now()]
            );
        });
        return $this->database->fetchOne('SELECT * FROM transfers WHERE id = ?', [$transferId]);
    }

    public function createInvoice(string $issuerId, string $assetCode, string $amount, string $title, ?string $description, ?string $dueAt): array
    {
        $this->guard($issuerId, $this->accountFor($issuerId, $assetCode), 'invoice');
        $asset = $this->assetByCode($assetCode);
        $amountMinor = $this->positiveAmount($amount, (int) $asset['scale']);
        $title = trim($title);
        if ($title === '') {
            throw new \RuntimeException('Give the invoice a title.');
        }
        $due = $dueAt !== null && trim($dueAt) !== '' && strtotime($dueAt) !== false ? gmdate('Y-m-d H:i:s', strtotime($dueAt)) : null;
        $id = Security::uuid();
        $this->database->execute(
            'INSERT INTO invoices (id, public_code, issuer_user_id, asset_id, amount_minor, title, description, due_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [$id, Security::reference('INV'), $issuerId, $asset['id'], $amountMinor, mb_substr($title, 0, 200), trim((string) $description) ?: null, $due]
        );
        return $this->database->fetchOne('SELECT * FROM invoices WHERE id = ?', [$id]);
    }

    public function payInvoice(string $payerId, string $invoiceCode, string $idempotencyToken): array
    {
        $invoice = $this->database->fetchOne('SELECT * FROM invoices WHERE public_code = ?', [strtoupper(trim($invoiceCode))]);
        if (!$invoice || $invoice['status'] !== 'open') {
            throw new \RuntimeException('This invoice is not open for payment.');
        }
        if ((string) $invoice['issuer_user_id'] === $payerId) {
            throw new \RuntimeException('You cannot pay your own invoice.');
        }
        if ($invoice['due_at'] !== null && strtotime((string) $invoice['due_at']) < time()) {
            throw new \RuntimeException('This invoice has expired.');
        }
        $asset = $this->database->fetchOne('SELECT code, scale FROM assets WHERE id = ?', [(string) $invoice['asset_id']]);
        $issuer = $this->database->fetchOne('SELECT email_normalized FROM users WHERE id = ?', [(string) $invoice['issuer_user_id']]);
        return $this->database->transaction(function (Database $db) use ($payerId, $invoice, $asset, $issuer, $idempotencyToken): array {
            $transfer = $this->internalTransfer(
                $payerId,
                (string) $issuer['email_normalized'],
                (string) $asset['code'],
                Money::format((int) $invoice['amount_minor'], (int) $asset['scale']),
                'Invoice ' . $invoice['public_code'] . ': ' . $invoice['title'],
                $idempotencyToken
            );
            $db->execute("UPDATE invoices SET status = 'paid', paid_at = ?, paid_by_user_id = ?, transfer_id = ?, updated_at = ? WHERE id = ?", [$this->now(), $payerId, $transfer['id'], $this->now(), (string) $invoice['id']]);
            return $db->fetchOne('SELECT * FROM invoices WHERE id = ?', [(string) $invoice['id']]);
        });
    }

    public function history(string $userId, ?string $accountId = null, int $limit = 100): array
    {
        $sql = 'SELECT t.*, a.account_number, aset.code AS asset_code, aset.symbol AS asset_symbol, aset.scale AS asset_scale FROM transactions t JOIN accounts a ON a.id = t.account_id JOIN assets aset ON aset.id = a.asset_id WHERE t.user_id = ?';
        $params = [$userId];
        if ($accountId !== null) {
            $sql .= ' AND t.account_id = ?';
            $params[] = $accountId;
        }
        $sql .= ' ORDER BY t.created_at DESC LIMIT ?';
        $params[] = max(1, min(200, $limit));
        return $this->database->fetchAll($sql, $params);
    }

    public function receipt(string $transactionId, string $userId): array
    {
        $row = $this->database->fetchOne(
            'SELECT t.*, a.account_number, aset.code AS asset_code, aset.symbol AS asset_symbol, aset.scale AS asset_scale FROM transactions t JOIN accounts a ON a.id = t.account_id JOIN assets aset ON aset.id = a.asset_id WHERE t.id = ? AND t.user_id = ?',
            [$transactionId, $userId]
        );
        if (!$row) {
            throw new \RuntimeException('Receipt not found.');
        }
        return $row;
    }

    private function createAccount(string $userId, array $asset): array
    {
        $user = $this->database->fetchOne('SELECT first_name, last_name FROM users WHERE id = ?', [$userId]) ?? [];
        $accountId = Security::uuid();
        $ledgerId = Security::uuid();
        $number = 'WF' . gmdate('y') . strtoupper(bin2hex(random_bytes(5)));
        $name = trim(($user['first_name'] ?? '') . ' ' . ($user['last_name'] ?? '')) . ' ' . $asset['code'];
        $this->database->transaction(function (Database $db) use ($userId, $asset, $accountId, $ledgerId, $number, $name): void {
            $db->execute(
                'INSERT INTO ledger_accounts (id, asset_id, owner_type, owner_id, code, name, account_class, normal_side) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [$ledgerId, $asset['id'], 'user', $userId, 'USER:' . $userId . ':' . $asset['code'], $name, 'liability', 'credit']
            );
            $db->execute(
                'INSERT INTO accounts (id, user_id, asset_id, ledger_account_id, account_number, status) VALUES (?, ?, ?, ?, ?, ?)',
                [$accountId, $userId, $asset['id'], $ledgerId, $number, 'active']
            );
        });
        return $this->database->fetchOne('SELECT a.*, la.code AS ledger_code FROM accounts a JOIN ledger_accounts la ON la.id = a.ledger_account_id WHERE a.id = ?', [$accountId]);
    }

    private function guard(string $userId, array $account, string $capability): void
    {
        $this->assertNotImpersonating('Money movement and security changes');
        $user = $this->database->fetchOne('SELECT status FROM users WHERE id = ?', [$userId]);
        if (!$user || $user['status'] !== 'active') {
            throw new \RuntimeException('This account is not active.');
        }
        if (($account['status'] ?? 'active') !== 'active') {
            throw new \RuntimeException('This asset account is frozen. Contact support.');
        }
        $kyc = $this->database->fetchOne('SELECT status FROM kyc_profiles WHERE user_id = ?', [$userId]);
        if (!$kyc || $kyc['status'] !== 'verified') {
            throw new \RuntimeException('Identity verification must be approved before this action.');
        }
        if (!(new Restrictions($this->database))->can($userId, $capability)) {
            throw new \RuntimeException('This action is restricted on your account. Contact support.');
        }
    }

    private function assertNotImpersonating(string $action): void
    {
        if (Context::isImpersonating()) {
            throw new \RuntimeException($action . ' are disabled during impersonation.');
        }
    }

    private function systemAccountId(string $assetId, string $accountClass): string
    {
        $row = $this->database->fetchOne("SELECT id FROM ledger_accounts WHERE asset_id = ? AND owner_type = 'system' AND account_class = ?", [$assetId, $accountClass]);
        if (!$row) {
            throw new \RuntimeException('The asset ledger is incomplete. Contact support.');
        }
        return (string) $row['id'];
    }

    private function positiveAmount(string $amount, int $scale): int
    {
        $minor = Money::parse($amount, $scale);
        if ($minor <= 0) {
            throw new \RuntimeException('Enter an amount greater than zero.');
        }
        return $minor;
    }

    private function idempotencyKey(string $scope, string $userId, string $token): string
    {
        $token = trim($token) !== '' ? trim($token) : Security::token(16);
        return $scope . ':' . Security::hashToken($userId . ':' . $token);
    }

    private function destinationSummary(array $destination): string
    {
        $parts = [];
        foreach (['bank_name', 'account_name', 'account_number', 'network', 'address', 'memo'] as $field) {
            if (!empty($destination[$field])) {
                $value = (string) $destination[$field];
                $parts[] = $field . ':' . (in_array($field, ['account_number', 'address'], true) ? '…' . substr($value, -4) : mb_substr($value, 0, 30));
            }
        }
        return mb_substr(implode('; ', $parts), 0, 200);
    }

    private function now(): string
    {
        return gmdate('Y-m-d H:i:s.u');
    }
}
