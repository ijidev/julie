<?php

declare(strict_types=1);

$kycStatus = (string) ($kyc['status'] ?? 'not_started');
$verified = $kycStatus === 'verified';
$site = wayfairs_public_settings();
$requestedCode = (string) ($_GET['currency'] ?? '');
$activeAccount = null;
foreach ($accounts as $candidate) {
    if ($requestedCode !== '' && $candidate['asset']['code'] === $requestedCode) {
        $activeAccount = $candidate;
        break;
    }
}
if (!$activeAccount && $accounts !== []) {
    $activeAccount = $accounts[0];
}
$asset = $activeAccount['asset'] ?? null;
$activeCode = (string) ($asset['code'] ?? '');
$available = (int) ($activeAccount['available_minor'] ?? 0);
$held = (int) ($activeAccount['held_minor'] ?? 0);
$total = $available + $held;
?>
<div class="section-head">
  <div>
    <p class="eyebrow">Overview</p>
    <h1>Your money</h1>
    <p>One balance at a time, with every movement recorded against your account.</p>
  </div>
  <div class="section-actions">
    <?= wayfairs_pill('kyc ' . $kycStatus) ?>
    <?php if ($verified): ?>
      <a class="btn small" href="<?= e(wayfairs_url('/deposit')) ?>"><?= wayfairs_icon('deposit', 'btn-icon') ?> Deposit</a>
    <?php endif; ?>
  </div>
</div>

<?php if (!$verified): ?>
  <div class="notice warn">
    <?= wayfairs_icon('verification') ?>
    <div>
      <strong>Verify your identity to start moving money</strong>
      <p>Deposits, withdrawals, transfers, and invoices unlock once an administrator approves your verification.</p>
      <p style="margin-top:.55rem"><a class="btn small" href="<?= e(wayfairs_url('/kyc')) ?>">Complete verification <?= wayfairs_icon('arrow-right', 'btn-icon') ?></a></p>
    </div>
  </div>
<?php endif; ?>

<?php foreach ($restrictions as $restriction): ?>
  <div class="notice bad">
    <?= wayfairs_icon('security') ?>
    <div>
      <strong>Restriction: <?= e(str_replace('_', ' ', (string) $restriction['capability'])) ?></strong>
      <p><?= e((string) $restriction['reason']) ?>. Contact support if you believe this is an error.</p>
    </div>
  </div>
<?php endforeach; ?>

<?php if ($activeAccount && $asset): ?>
  <section class="card balance-card">
    <div class="balance-layout">
      <div>
        <p class="eyebrow">Available to use</p>
        <div class="balance"><?= e(wayfairs_amount($available, (int) $asset['scale'], (string) $asset['symbol'], (string) $asset['code'])) ?></div>
        <div class="balance-owner">
          <span class="hint"><?= e((string) $asset['name']) ?> · <?= e((string) $activeAccount['account_number']) ?></span>
          <?= wayfairs_pill((string) $activeAccount['status']) ?>
        </div>
      </div>
      <div class="balance-side">
        <label for="currency-select">Active currency
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
      <div><strong><?= e(wayfairs_amount($held, (int) $asset['scale'], (string) $asset['symbol'])) ?></strong><span>Reserved for pending withdrawals</span></div>
      <div><strong><?= e(wayfairs_amount($total, (int) $asset['scale'], (string) $asset['symbol'])) ?></strong><span>Total ledger balance</span></div>
      <div><strong><?= e((string) $activeAccount['account_number']) ?></strong><span>Account number</span></div>
    </div>
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
    <div>
      <strong>No accounts are enabled yet</strong>
      <p>An administrator has not enabled a currency or asset for this bank. Check back shortly.</p>
    </div>
  </div>
<?php endif; ?>

<section class="grid two">
  <article class="card">
    <div class="section-head">
      <div><h2>Your accounts</h2><p>Every enabled currency has its own account number and statement.</p></div>
    </div>
    <?php if ($accounts === []): ?>
      <p class="muted">No accounts opened yet.</p>
    <?php else: ?>
      <div class="account-list">
        <?php foreach ($accounts as $candidate): $candidateAsset = $candidate['asset']; ?>
          <a class="account-row" href="<?= e(wayfairs_url('/accounts/' . $candidateAsset['code'])) ?>">
            <span class="account-code"><?= e((string) $candidateAsset['code']) ?></span>
            <span class="account-main">
              <strong><?= e((string) $candidateAsset['name']) ?></strong>
              <span><?= e((string) $candidate['account_number']) ?> · <?= e(ucfirst((string) $candidateAsset['asset_type'])) ?></span>
            </span>
            <span class="account-tail">
              <?= wayfairs_pill((string) $candidate['status']) ?>
              <?= wayfairs_icon('arrow-right', 'btn-icon') ?>
            </span>
          </a>
        <?php endforeach; ?>
      </div>
    <?php endif; ?>
  </article>

  <article class="card">
    <div class="section-head">
      <div><h2>Account status</h2><p>The checks that control what you can do.</p></div>
    </div>
    <dl class="kv">
      <dt>Identity</dt><dd><?= wayfairs_pill('kyc ' . $kycStatus) ?></dd>
      <dt>Restrictions</dt><dd><?= $restrictions === [] ? 'None active' : count($restrictions) . ' active' ?></dd>
      <dt>Enabled accounts</dt><dd><?= count($accounts) ?></dd>
      <dt>Support</dt><dd><?= e((string) ($site['site.support_email'] ?? 'Contact support')) ?></dd>
    </dl>
    <div class="section-actions" style="margin-top:1rem">
      <a class="btn small ghost" href="<?= e(wayfairs_url('/security')) ?>">Security</a>
      <a class="btn small ghost" href="<?= e(wayfairs_url('/kyc')) ?>">Verification</a>
    </div>
  </article>
</section>

<section class="card">
  <div class="section-head">
    <div>
      <h2>Recent activity</h2>
      <p>Your latest transactions across every account.</p>
    </div>
    <?php if ($activeAccount): ?>
      <a class="btn small ghost" href="<?= e(wayfairs_url('/accounts/' . $activeCode)) ?>">Open statement</a>
    <?php endif; ?>
  </div>
  <?php if ($history === []): ?>
    <div class="empty-state">
      <div class="empty-icon"><?= wayfairs_icon('wallet') ?></div>
      <h3>No activity yet</h3>
      <p>Your transactions will appear here once you make your first deposit, transfer, or payment.</p>
      <?php if ($verified): ?><a class="btn small" href="<?= e(wayfairs_url('/deposit')) ?>">Make a deposit</a><?php endif; ?>
    </div>
  <?php else: ?>
    <div class="table-wrap"><table>
      <thead><tr><th>Date</th><th>Description</th><th>Amount</th><th>Status</th><th></th></tr></thead>
      <tbody>
      <?php foreach ($history as $row): $pending = in_array((string) $row['status'], ['pending', 'processing'], true); ?>
        <tr>
          <td><?= e(wayfairs_datetime((string) $row['created_at'])) ?></td>
          <td>
            <strong><?= e((string) $row['description']) ?></strong>
            <div class="hint"><?= e(str_replace('_', ' ', (string) $row['transaction_type'])) ?> · <?= e((string) $row['public_reference']) ?></div>
          </td>
          <td class="<?= $pending ? 'muted' : ($row['direction'] === 'credit' ? 'amount-positive' : 'amount-negative') ?>">
            <?= e(($row['direction'] === 'credit' ? '+' : '−') . wayfairs_amount((int) $row['amount_minor'], (int) $row['asset_scale'], (string) $row['asset_symbol'], (string) $row['asset_code'])) ?>
          </td>
          <td><?= wayfairs_pill((string) $row['status']) ?></td>
          <td><a href="<?= e(wayfairs_url('/receipts/' . $row['id'])) ?>">Receipt</a></td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table></div>
  <?php endif; ?>
</section>
