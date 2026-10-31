<?php

declare(strict_types=1);

$kycStatus = (string) ($kyc['status'] ?? 'not_started');
$verified = $kycStatus === 'verified';
$site = wayfairs_public_settings();
$user = \Wayfairs\Core\Context::user() ?? [];
$firstName = trim((string) ($user['first_name'] ?? '')) ?: 'there';
$requestedCode = strtoupper(trim((string) ($_GET['currency'] ?? '')));
$activeAccount = null;
foreach ($accounts as $candidate) {
    if ($requestedCode !== '' && (string) $candidate['asset']['code'] === $requestedCode) {
        $activeAccount = $candidate;
        break;
    }
}
if ($activeAccount === null && $accounts !== []) {
    $activeAccount = $accounts[0];
}
$asset = $activeAccount['asset'] ?? null;
$activeCode = (string) ($asset['code'] ?? '');
$available = (int) ($activeAccount['available_minor'] ?? 0);
$held = (int) ($activeAccount['held_minor'] ?? 0);
$total = $available + $held;
?>
<header class="page-header">
  <div class="page-heading">
    <span class="page-icon"><?= wayfairs_icon('overview') ?></span>
    <div class="page-heading-copy">
      <span class="page-kicker">Account overview</span>
      <h1>Welcome back, <?= e($firstName) ?></h1>
      <p>See your active balance, account readiness, and latest recorded money movements.</p>
    </div>
  </div>
  <div class="page-actions">
    <?= wayfairs_pill('kyc ' . $kycStatus) ?>
    <?php if ($verified): ?>
      <a class="btn" href="<?= e(wayfairs_url('/deposit')) ?>"><?= wayfairs_icon('deposit') ?> Deposit funds</a>
    <?php endif; ?>
  </div>
</header>

<?php if (!$verified): ?>
  <div class="notice warn">
    <?= wayfairs_icon('verification') ?>
    <div>
      <strong>Identity verification is not complete</strong>
      <p>Money movement unlocks only after an administrator approves the details you submit.</p>
      <p><a class="btn small" href="<?= e(wayfairs_url('/kyc')) ?>">Review verification <?= wayfairs_icon('arrow-right', 'btn-icon') ?></a></p>
    </div>
  </div>
<?php endif; ?>

<?php foreach ($restrictions as $restriction): ?>
  <div class="notice bad">
    <?= wayfairs_icon('security') ?>
    <div>
      <strong><?= e(ucwords(str_replace('_', ' ', (string) $restriction['capability']))) ?> restricted</strong>
      <p><?= e((string) $restriction['reason']) ?>. Contact support if you believe this is incorrect.</p>
    </div>
  </div>
<?php endforeach; ?>

<?php if ($activeAccount && $asset): ?>
  <section class="content-grid">
    <article class="card balance-card v2">
      <div class="balance-layout">
        <div>
          <p class="eyebrow">Available balance</p>
          <div class="balance"><?= e(wayfairs_amount($available, (int) $asset['scale'], (string) $asset['symbol'], (string) $asset['code'])) ?></div>
          <div class="balance-owner">
            <span class="hint"><?= e((string) $asset['name']) ?> · <?= e((string) $activeAccount['account_number']) ?></span>
            <?= wayfairs_pill((string) $activeAccount['status']) ?>
          </div>
        </div>
        <div class="balance-side">
          <label for="currency-select">Viewing currency
            <select id="currency-select">
              <?php foreach ($accounts as $candidate): ?>
                <option value="<?= e((string) $candidate['asset']['code']) ?>" <?= $candidate['asset']['code'] === $activeCode ? 'selected' : '' ?>>
                  <?= e((string) $candidate['asset']['code']) ?> · <?= e((string) $candidate['asset']['name']) ?>
                </option>
              <?php endforeach; ?>
            </select>
          </label>
          <div class="balance-actions">
            <a class="btn small" href="<?= e(wayfairs_url('/deposit')) ?>">Deposit</a>
            <a class="btn small ghost" href="<?= e(wayfairs_url('/withdraw')) ?>">Withdraw</a>
            <a class="btn small ghost" href="<?= e(wayfairs_url('/transfer')) ?>">Transfer</a>
          </div>
        </div>
      </div>
      <div class="balance-meta">
        <div><strong><?= e(wayfairs_amount($held, (int) $asset['scale'], (string) $asset['symbol'])) ?></strong><span>Reserved</span></div>
        <div><strong><?= e(wayfairs_amount($total, (int) $asset['scale'], (string) $asset['symbol'])) ?></strong><span>Ledger total</span></div>
        <div><strong><?= e((string) $activeAccount['account_number']) ?></strong><span>Account number</span></div>
      </div>
    </article>

    <article class="card static">
      <div class="panel-head">
        <div><h2>Your currencies</h2><p>Choose an account to open its full statement.</p></div>
        <span class="pill"><?= count($accounts) ?> enabled</span>
      </div>
      <div class="account-stack">
        <?php foreach ($accounts as $candidate): $candidateAsset = $candidate['asset']; ?>
          <a class="account-tile <?= $candidateAsset['code'] === $activeCode ? 'active' : '' ?>" href="<?= e(wayfairs_url('/accounts/' . $candidateAsset['code'])) ?>">
            <span class="account-badge"><?= e((string) $candidateAsset['code']) ?></span>
            <span class="account-copy"><strong><?= e((string) $candidateAsset['name']) ?></strong><small><?= e((string) $candidate['account_number']) ?> · <?= e(ucfirst((string) $candidateAsset['asset_type'])) ?></small></span>
            <span class="account-end"><?= wayfairs_pill((string) $candidate['status']) ?><?= wayfairs_icon('arrow-right') ?></span>
          </a>
        <?php endforeach; ?>
      </div>
    </article>
  </section>

  <script>
  (function () {
    var select = document.getElementById('currency-select');
    if (!select) return;
    select.addEventListener('change', function () {
      var url = new URL(window.location.href);
      url.searchParams.set('currency', select.value);
      window.location.href = url.toString();
    });
  })();
  </script>
<?php else: ?>
  <div class="notice brand">
    <?= wayfairs_icon('wallet') ?>
    <div><strong>No currency accounts are enabled</strong><p>An administrator has not enabled a customer currency yet. No balance is being inferred.</p></div>
  </div>
<?php endif; ?>

<nav class="quick-grid" aria-label="Quick banking actions">
  <a class="quick-action" href="<?= e(wayfairs_url('/deposit')) ?>"><span class="icon-wrap"><?= wayfairs_icon('deposit') ?></span><span>Deposit</span></a>
  <a class="quick-action" href="<?= e(wayfairs_url('/withdraw')) ?>"><span class="icon-wrap"><?= wayfairs_icon('withdraw') ?></span><span>Withdraw</span></a>
  <a class="quick-action" href="<?= e(wayfairs_url('/transfer')) ?>"><span class="icon-wrap"><?= wayfairs_icon('transfer') ?></span><span>Send money</span></a>
  <a class="quick-action" href="<?= e(wayfairs_url('/invoices')) ?>"><span class="icon-wrap"><?= wayfairs_icon('invoice') ?></span><span>Invoices</span></a>
</nav>

<section class="content-grid">
  <article class="card static">
    <div class="panel-head">
      <div><h2>Recent transactions</h2><p>Latest activity across your enabled accounts.</p></div>
      <a class="btn small ghost" href="<?= e(wayfairs_url('/transactions')) ?>">View all</a>
    </div>
    <?php if ($history === []): ?>
      <div class="empty-state">
        <div class="empty-icon"><?= wayfairs_icon('activity') ?></div>
        <h3>No transactions yet</h3>
        <p>Your persisted transaction records will appear here after your first money movement.</p>
      </div>
    <?php else: ?>
      <div class="transaction-list">
        <?php foreach (array_slice($history, 0, 6) as $row): $credit = (string) $row['direction'] === 'credit'; ?>
          <a class="transaction-item" href="<?= e(wayfairs_url('/receipts/' . $row['id'])) ?>">
            <span class="transaction-symbol <?= $credit ? 'credit' : 'debit' ?>"><?= wayfairs_icon($credit ? 'deposit' : 'withdraw') ?></span>
            <span class="transaction-main"><strong><?= e((string) $row['description']) ?></strong><span><?= e(str_replace('_', ' ', (string) $row['transaction_type'])) ?> · <?= e((string) $row['public_reference']) ?></span></span>
            <span class="transaction-meta"><strong><?= e((string) $row['asset_code']) ?></strong><span><?= e(wayfairs_datetime((string) $row['created_at'])) ?></span></span>
            <span class="transaction-amount <?= $credit ? 'amount-positive' : 'amount-negative' ?>"><?= e(($credit ? '+' : '−') . wayfairs_amount((int) $row['amount_minor'], (int) $row['asset_scale'], (string) $row['asset_symbol'])) ?></span>
            <span class="transaction-arrow"><?= wayfairs_icon('arrow-right') ?></span>
          </a>
        <?php endforeach; ?>
      </div>
    <?php endif; ?>
  </article>

  <aside class="card static">
    <div class="panel-head"><div><h2>Account readiness</h2><p>Controls currently applied to your account.</p></div></div>
    <div class="status-checklist">
      <div class="status-check">
        <span class="status-check-icon <?= $verified ? '' : 'warn' ?>"><?= wayfairs_icon($verified ? 'check' : 'clock') ?></span>
        <span class="status-check-copy"><strong>Identity verification</strong><span><?= e(ucwords(str_replace('_', ' ', $kycStatus))) ?></span></span>
      </div>
      <div class="status-check">
        <span class="status-check-icon <?= $restrictions === [] ? '' : 'bad' ?>"><?= wayfairs_icon($restrictions === [] ? 'check' : 'security') ?></span>
        <span class="status-check-copy"><strong>Capability restrictions</strong><span><?= $restrictions === [] ? 'None active' : count($restrictions) . ' active' ?></span></span>
      </div>
      <div class="status-check">
        <span class="status-check-icon"><?= wayfairs_icon('wallet') ?></span>
        <span class="status-check-copy"><strong>Enabled currency accounts</strong><span><?= count($accounts) ?> persisted account<?= count($accounts) === 1 ? '' : 's' ?></span></span>
      </div>
      <div class="status-check">
        <span class="status-check-icon"><?= wayfairs_icon('support') ?></span>
        <span class="status-check-copy"><strong>Support</strong><span><?= e((string) ($site['site.support_email'] ?? 'Not configured')) ?></span></span>
      </div>
    </div>
  </aside>
</section>
