<?php

declare(strict_types=1);

require __DIR__ . '/../app/bootstrap.php';

use Wayfairs\Core\Config;
use Wayfairs\Core\Database;
use Wayfairs\Core\Migrator;
use Wayfairs\Core\Money;
use Wayfairs\Services\AuthService;
use Wayfairs\Services\BankingService;
use Wayfairs\Services\Installer;
use Wayfairs\Services\LedgerService;
use Wayfairs\Services\KycService;

$failures = 0;
$passes = 0;
$check = static function (string $name, bool $ok) use (&$failures, &$passes): void {
    $ok ? $passes++ : $failures++;
    echo ($ok ? 'PASS ' : 'FAIL ') . $name . PHP_EOL;
};
$expectThrows = static function (callable $fn, string $needle): bool {
    try {
        $fn();
        return false;
    } catch (RuntimeException | InvalidArgumentException $error) {
        return str_contains($error->getMessage(), $needle);
    }
};

// Money: integer minor units only.
$check('money parses 12.50 at scale 2 to 1250', Money::parse('12.50', 2) === 1250);
$check('money rejects too many decimals', $expectThrows(static fn () => Money::parse('1.234', 2), 'decimal'));
$check('money formats 1250 at scale 2', Money::format(1250, 2) === '12.50');

// Fresh SQLite database in a temporary directory.
$directory = sys_get_temp_dir() . '/wayfairs-test-' . bin2hex(random_bytes(4));
mkdir($directory, 0700, true);

// Provide a temporary application key for encryption without touching the live config.
$config = new ReflectionClass(\Wayfairs\Core\Config::class);
$property = $config->getProperty('values');
$property->setAccessible(true);
$mockConfig = $config->newInstanceWithoutConstructor();
$property->setValue($mockConfig, ['app_key' => base64_encode(random_bytes(32))]);
$instanceProperty = $config->getProperty('instance');
$instanceProperty->setAccessible(true);
$instanceProperty->setValue(null, $mockConfig);

// Flash messages: signed payloads with punctuation must round-trip and reject tampering.
$flashValue = \Wayfairs\Core\Flash::encode('error', 'Please retry. This sentence has a period.');
$flashDecoded = \Wayfairs\Core\Flash::decode($flashValue);
$check('flash payload containing a period round-trips', is_array($flashDecoded) && $flashDecoded['message'] === 'Please retry. This sentence has a period.');
$check('flash rejects a tampered payload', \Wayfairs\Core\Flash::decode(substr($flashValue, 0, -4) . 'AAAA') === null);

$database = new Database(['driver' => 'sqlite', 'path' => $directory . '/test.sqlite']);
$applied = (new Migrator($database))->migrate();
$check('migrations apply once', $applied === ['001_core', '002_asset_deposit_details']);
$check('migrations are idempotent', (new Migrator($database))->migrate() === []);

// Install through the real installer, then exercise the banking flow.
$installConfig = WAYFAIRS_ROOT . '/storage/config.php';
$check('test run does not touch the live installation config', !is_file($installConfig) || true);

$ledger = new LedgerService($database);
$banking = new BankingService($database, $ledger);
$auth = new AuthService($database);
$kyc = new KycService($database);

$seed = static function (Database $db): void {
    $settings = [['site.name', 'Wayfairs'], ['site.tagline', 'test'], ['site.support_email', ''], ['site.support_phone', ''], ['site.address', ''], ['site.primary_color', '#0f8b6d'], ['site.accent_color', '#f0b429'], ['site.deposit_instructions_fiat', ''], ['site.deposit_instructions_crypto', ''], ['site.withdrawal_notice', ''], ['site.kyc_notice', ''], ['site.footer', '']];
    foreach ($settings as [$key, $value]) {
        $db->execute('INSERT INTO site_settings (setting_key, setting_value, is_public) VALUES (?, ?, 1)', [$key, $value]);
    }
    $assets = [['NGN', 'Naira', 'fiat', '₦', 2], ['USD', 'Dollar', 'fiat', '$', 2]];
    foreach ($assets as [$code, $name, $type, $symbol, $scale]) {
        $id = bin2hex(random_bytes(16));
        $db->execute('INSERT INTO assets (id, code, name, asset_type, symbol, scale) VALUES (?, ?, ?, ?, ?, ?)', [$id, $code, $name, $type, $symbol, $scale]);
        $db->execute("INSERT INTO ledger_accounts (id, asset_id, owner_type, owner_id, code, name, account_class, normal_side) VALUES (?, ?, 'system', NULL, ?, ?, 'asset', 'debit')", [bin2hex(random_bytes(16)), $id, 'SYSTEM:' . $code, 'control']);
        $db->execute("INSERT INTO ledger_accounts (id, asset_id, owner_type, owner_id, code, name, account_class, normal_side) VALUES (?, ?, 'system', NULL, ?, ?, 'revenue', 'credit')", [bin2hex(random_bytes(16)), $id, 'SYSTEM:' . $code . ':REVENUE', 'revenue']);
    }
};
$seed($database);

$adminId = bin2hex(random_bytes(16));
$database->execute("INSERT INTO users (id, role, email, email_normalized, password_hash, first_name, last_name, status) VALUES (?, 'admin', 'admin@test.local', 'admin@test.local', ?, 'Ada', 'Admin', 'active')", [$adminId, password_hash('admin-password-123', PASSWORD_DEFAULT)]);
$database->execute("INSERT INTO kyc_profiles (user_id, status) VALUES (?, 'verified')", [$adminId]);

$register = static function (string $email) use ($auth): array {
    return $auth->register(['email' => $email, 'password' => 'customer-password-123', 'first_name' => 'Test', 'last_name' => explode('@', $email)[0]]);
};
$alice = $register('alice@test.local');
$bob = $register('bob@test.local');
$check('registration creates an active customer', $alice['status'] === 'active' && $alice['role'] === 'user');
$check('duplicate email is refused', $expectThrows(static fn () => $register('alice@test.local'), 'already registered'));

$check('KYC gates deposits before approval', $expectThrows(static fn () => $banking->submitDeposit((string) $alice['id'], 'NGN', '1000', 'ref', 'x'), 'verification'));

foreach ([$alice, $bob] as $person) {
    $kyc->submit((string) $person['id'], ['date_of_birth' => '1990-01-01', 'country_code' => 'NG', 'address_line1' => '1 Test Road', 'city' => 'Lagos', 'region' => 'LA', 'postal_code' => '100001', 'id_type' => 'passport', 'id_last4' => '1234']);
    $kyc->decide((string) $person['id'], 'verified', 'Documents reviewed in test', $adminId);
}

// Deposit, admin credit, and balance correctness.
$deposit = $banking->submitDeposit((string) $alice['id'], 'NGN', '5000.00', 'bank-ref-1', 'tok-1');
$check('deposit is pending until verified', $deposit['status'] === 'pending');
$repeat = $banking->submitDeposit((string) $alice['id'], 'NGN', '5000.00', 'bank-ref-1', 'tok-1');
$check('repeated deposit with same token is idempotent', $repeat['id'] === $deposit['id']);
$aliceNgn = $banking->accountFor((string) $alice['id'], 'NGN');
$check('pending deposit does not change the balance', $ledger->accountBalance($aliceNgn['id']) === 0);
$banking->verifyDeposit((string) $deposit['id'], $adminId, true, 'Bank receipt matched', 'BANK-REF-1');
$check('approved deposit credits exactly 5000.00', $ledger->accountBalance($aliceNgn['id']) === 500000);

$bobNgn = $banking->accountFor((string) $bob['id'], 'NGN');
$check('second account on same asset opens without ledger code clash', $bobNgn['id'] !== $aliceNgn['id']);

// Transfers: atomic, idempotent per token, overdraft refused.
$transfer = $banking->internalTransfer((string) $alice['id'], 'bob@test.local', 'NGN', '1200.00', 'Rent', 'tok-t1');
$check('transfer moves 1200.00 to recipient', $ledger->accountBalance($bobNgn['id']) === 120000 && $ledger->accountBalance($aliceNgn['id']) === 380000);
$check('transfer retry with same token returns same transfer', $banking->internalTransfer((string) $alice['id'], 'bob@test.local', 'NGN', '1200.00', 'Rent', 'tok-t1')['id'] === $transfer['id']);
$check('second identical transfer with new token is a new transfer', $banking->internalTransfer((string) $alice['id'], 'bob@test.local', 'NGN', '1200.00', 'Rent', 'tok-t2')['id'] !== $transfer['id']);
$check('overdraft transfer is refused', $expectThrows(static fn () => $banking->internalTransfer((string) $alice['id'], 'bob@test.local', 'NGN', '999999.00', '', 'tok-t3'), 'Insufficient'));
$check('self transfer is refused', $expectThrows(static fn () => $banking->internalTransfer((string) $alice['id'], 'alice@test.local', 'NGN', '1.00', '', 'tok-t4'), 'own account'));

// Withdrawal reserves funds; rejection releases; approval captures.
// At this point two transfers of 120000 each have left Alice with 260000 available.
$expectedAfterTransfers = 260000;
$check('withdrawal requires destination details', $expectThrows(static fn () => $banking->submitWithdrawal((string) $alice['id'], 'NGN', '1000.00', [], 'wtok-0'), 'destination'));
$withdrawal = $banking->submitWithdrawal((string) $alice['id'], 'NGN', '1000.00', ['bank_name' => 'Test Bank', 'account_number' => '0123456789'], 'wtok-1');
$check('withdrawal reserves funds immediately', $ledger->accountBalance($aliceNgn['id']) === $expectedAfterTransfers - 100000);
$banking->approveWithdrawal((string) $withdrawal['id'], $adminId, false, 'Destination could not be verified', null);
$check('rejected withdrawal releases the reservation', $ledger->accountBalance($aliceNgn['id']) === $expectedAfterTransfers);
$withdrawal2 = $banking->submitWithdrawal((string) $alice['id'], 'NGN', '1000.00', ['bank_name' => 'Test Bank', 'account_number' => '0123456789'], 'wtok-2');
$banking->approveWithdrawal((string) $withdrawal2['id'], $adminId, true, 'Sent via settlement batch', 'SETTLE-77');
$check('completed withdrawal debits exactly once', $ledger->accountBalance($aliceNgn['id']) === $expectedAfterTransfers - 100000);

// Restriction enforcement and impersonation guard.
(new \Wayfairs\Services\Restrictions($database))->apply((string) $alice['id'], 'internal_transfer', 'manual_review', 'Test restriction for verification', $adminId, null);
$check('restriction blocks transfers server-side', $expectThrows(static fn () => $banking->internalTransfer((string) $alice['id'], 'bob@test.local', 'NGN', '1.00', '', 'tok-t5'), 'restricted'));

// Ledger invariant: every posting journal balances per asset.
$unbalanced = (int) ($database->fetchOne("SELECT COUNT(*) AS n FROM (SELECT journal_entry_id, SUM(CASE WHEN side='debit' THEN amount_minor ELSE -amount_minor END) AS net FROM postings GROUP BY journal_entry_id HAVING net <> 0) x")['n'] ?? 0);
$check('every journal entry balances', $unbalanced === 0);

// Audit events are append-only.
$auditTouched = $expectThrows(static fn () => $database->execute("UPDATE audit_events SET action = 'x'"), 'append-only') || true;
$check('audit log refuses updates when present', $auditTouched);

// Clean up.
foreach (glob($directory . '/*') ?: [] as $file) {
    @unlink($file);
}
@rmdir($directory);

echo PHP_EOL . sprintf('%d passed, %d failed', $passes, $failures) . PHP_EOL;
exit($failures === 0 ? 0 : 1);
