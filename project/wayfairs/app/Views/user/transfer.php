<?php

declare(strict_types=1);

$kycStatus = (string) ($kyc['status'] ?? 'not_started');
$verified = $kycStatus === 'verified';
$firstAccount = $accounts[0] ?? null;
$firstAsset = $firstAccount['asset'] ?? null;
?>
<header class="page-header">
  <div class="page-heading"><span class="page-icon"><?= wayfairs_icon('transfer') ?></span><div class="page-heading-copy"><span class="page-kicker">Internal payment</span><h1>Send money</h1><p>Transfer between Wayfairs customers using the recipient's registered email address.</p></div></div>
  <div class="page-actions"><?= wayfairs_pill('kyc ' . $kycStatus) ?><a class="btn ghost" href="<?= e(wayfairs_url('/transactions')) ?>">Transactions</a></div>
</header>

<?php if (!$verified): ?><div class="notice warn"><?= wayfairs_icon('verification') ?><div><strong>Verification approval is required</strong><p>Internal transfers remain unavailable until your identity status is verified.</p><p><a class="btn small" href="<?= e(wayfairs_url('/kyc')) ?>">Go to verification</a></p></div></div><?php endif; ?>

<section class="content-grid">
  <article class="card form-card">
    <div class="form-intro"><h2>Transfer details</h2><p>Transfers settle immediately between customer accounts in the same currency.</p></div>
    <?php if ($accounts === []): ?>
      <div class="empty-state"><div class="empty-icon"><?= wayfairs_icon('wallet') ?></div><h3>No currency account available</h3><p>An enabled account is required before you can transfer.</p></div>
    <?php else: ?>
      <form class="stack" method="post" action="<?= e(wayfairs_url('/transfer')) ?>" id="transfer-form">
        <input type="hidden" name="_token" value="<?= e(wayfairs_csrf()) ?>" />
        <input type="hidden" name="idem" value="<?= e(wayfairs_idem()) ?>" />
        <label>Recipient email<input type="email" name="recipient_email" placeholder="customer@example.com" autocomplete="email" required <?= $verified ? '' : 'disabled' ?> /><span class="field-hint">The email must belong to another active Wayfairs customer.</span></label>
        <label>Currency
          <select name="asset_code" id="transfer-asset" required <?= $verified ? '' : 'disabled' ?>>
            <?php foreach ($accounts as $account): $asset = $account['asset']; ?>
              <option value="<?= e((string) $asset['code']) ?>" data-available="<?= e(wayfairs_amount((int) $account['available_minor'], (int) $asset['scale'], (string) $asset['symbol'], (string) $asset['code'])) ?>" data-fee="<?= e(wayfairs_amount((int) $asset['transfer_fee_minor'], (int) $asset['scale'], (string) $asset['symbol'], (string) $asset['code'])) ?>"><?= e((string) $asset['name']) ?> (<?= e((string) $asset['code']) ?>)</option>
            <?php endforeach; ?>
          </select>
        </label>
        <div class="selection-summary">
          <div class="summary-line"><small>Available</small><strong id="transfer-available"><?= e($firstAccount ? wayfairs_amount((int) $firstAccount['available_minor'], (int) $firstAsset['scale'], (string) $firstAsset['symbol'], (string) $firstAsset['code']) : '—') ?></strong></div>
          <div class="summary-line"><small>Transfer fee</small><strong id="transfer-fee"><?= e($firstAsset ? wayfairs_amount((int) $firstAsset['transfer_fee_minor'], (int) $firstAsset['scale'], (string) $firstAsset['symbol'], (string) $firstAsset['code']) : '—') ?></strong></div>
        </div>
        <label>Amount<input name="amount" inputmode="decimal" placeholder="0.00" required <?= $verified ? '' : 'disabled' ?> /></label>
        <label>Payment note <span class="field-hint">Optional</span><input name="note" maxlength="200" placeholder="What is this payment for?" <?= $verified ? '' : 'disabled' ?> /></label>
        <div class="form-actions"><button class="btn full" type="submit" <?= $verified ? '' : 'disabled' ?>><?= $verified ? 'Review and send' : 'Verification required' ?> <?= wayfairs_icon('arrow-right', 'btn-icon') ?></button></div>
      </form>
      <script>
      (function () {
        var select = document.getElementById('transfer-asset');
        var available = document.getElementById('transfer-available');
        var fee = document.getElementById('transfer-fee');
        if (!select) return;
        function sync() { var option = select.options[select.selectedIndex]; if (!option) return; if (available) available.textContent = option.getAttribute('data-available') || '—'; if (fee) fee.textContent = option.getAttribute('data-fee') || '—'; }
        select.addEventListener('change', sync); sync();
      })();
      </script>
    <?php endif; ?>
  </article>

  <aside class="stack-list sticky-panel">
    <article class="card static">
      <div class="panel-head"><div><h2>Before you send</h2><p>Transfers post directly to the recipient's matching currency account.</p></div></div>
      <div class="status-checklist">
        <div class="status-check"><span class="status-check-icon"><?= wayfairs_icon('check') ?></span><span class="status-check-copy"><strong>Recipient matching</strong><span>The registered email identifies the recipient account.</span></span></div>
        <div class="status-check"><span class="status-check-icon"><?= wayfairs_icon('activity') ?></span><span class="status-check-copy"><strong>Immediate ledger posting</strong><span>Successful transfers debit and credit both accounts in one balanced entry.</span></span></div>
        <div class="status-check"><span class="status-check-icon"><?= wayfairs_icon('receipt') ?></span><span class="status-check-copy"><strong>Permanent record</strong><span>Both customers receive persisted transaction history.</span></span></div>
      </div>
    </article>
    <article class="card static">
      <div class="panel-head"><div><h2>Available accounts</h2><p>Balances already exclude active withdrawal holds.</p></div></div>
      <div class="account-stack"><?php foreach ($accounts as $account): $asset = $account['asset']; ?><div class="account-tile"><span class="account-badge"><?= e((string) $asset['code']) ?></span><span class="account-copy"><strong><?= e((string) $asset['name']) ?></strong><small><?= e((string) $account['account_number']) ?></small></span><span class="account-end"><strong><?= e(wayfairs_amount((int) $account['available_minor'], (int) $asset['scale'], (string) $asset['symbol'])) ?></strong><small>Available</small></span></div><?php endforeach; ?></div>
    </article>
  </aside>
</section>

<section class="card static">
  <div class="panel-head"><div><h2>Transfer history</h2><p>Your latest sent and received internal payments.</p></div><span class="pill"><?= count($transfers) ?> loaded</span></div>
  <?php if ($transfers === []): ?>
    <div class="empty-state"><div class="empty-icon"><?= wayfairs_icon('transfer') ?></div><h3>No transfers yet</h3><p>Completed internal transfers will appear here.</p></div>
  <?php else: ?>
    <div class="transaction-list">
      <?php foreach ($transfers as $t): $sent = (string) $t['sender_user_id'] === $me; ?>
        <div class="transaction-item">
          <span class="transaction-symbol <?= $sent ? 'debit' : 'credit' ?>"><?= wayfairs_icon('transfer') ?></span>
          <span class="transaction-main"><strong><?= e($sent ? 'Sent to ' . (string) $t['recipient_email'] : 'Received from ' . (string) $t['sender_email']) ?></strong><span><?= e(trim((string) ($t['note'] ?? '')) !== '' ? (string) $t['note'] : (string) $t['public_reference']) ?></span></span>
          <span class="transaction-meta"><strong><?= e((string) $t['asset_code']) ?> · <?= wayfairs_pill((string) $t['status']) ?></strong><span><?= e(wayfairs_datetime((string) $t['created_at'])) ?></span></span>
          <span class="transaction-amount <?= $sent ? 'amount-negative' : 'amount-positive' ?>"><?= e(($sent ? '−' : '+') . wayfairs_amount((int) $t['amount_minor'], (int) $t['asset_scale'], (string) $t['asset_symbol'], (string) $t['asset_code'])) ?></span>
          <span></span>
        </div>
      <?php endforeach; ?>
    </div>
  <?php endif; ?>
</section>
