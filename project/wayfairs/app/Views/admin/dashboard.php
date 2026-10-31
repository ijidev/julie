<?php

declare(strict_types=1);

$depositCount = (int) $stats['deposits'];
$withdrawalCount = (int) $stats['withdrawals'];
$reviewCount = (int) $stats['kyc_review'];
$restrictionCount = (int) ($stats['restrictions'] ?? 0);
?>
<div class="section-head">
  <div>
    <p class="eyebrow">Operations</p>
    <h1>Operations dashboard</h1>
    <p>Live work queues for verification, deposits, and withdrawals. Every figure below is read from persisted records.</p>
  </div>
  <div class="section-actions">
    <a class="btn small ghost" href="<?= e(wayfairs_url('/admin/audit')) ?>"><?= wayfairs_icon('audit', 'btn-icon') ?> Audit log</a>
    <a class="btn small" href="<?= e(wayfairs_url('/admin/users')) ?>"><?= wayfairs_icon('customers', 'btn-icon') ?> Customers</a>
  </div>
</div>

<?php if ($restrictionCount > 0): ?>
  <div class="notice warn">
    <?= wayfairs_icon('security') ?>
    <div>
      <strong><?= $restrictionCount ?> active capability restriction<?= $restrictionCount === 1 ? '' : 's' ?></strong>
      <p>Restricted customers cannot use the affected money movement until an administrator records a release reason.</p>
      <p style="margin-top:.55rem"><a class="btn small ghost" href="<?= e(wayfairs_url('/admin/users')) ?>">Review customers</a></p>
    </div>
  </div>
<?php endif; ?>

<section class="grid four">
  <a class="card stat" href="<?= e(wayfairs_url('/admin/users')) ?>">
    <div class="stat-head"><span class="eyebrow">Customers</span><?= wayfairs_icon('customers') ?></div>
    <span class="stat-value"><?= (int) $stats['customers'] ?></span>
    <span class="stat-label">Registered customer accounts</span>
  </a>
  <a class="card stat <?= $reviewCount > 0 ? 'attention' : '' ?>" href="<?= e(wayfairs_url('/admin/users')) ?>">
    <div class="stat-head"><span class="eyebrow">Verification</span><?= wayfairs_icon('verification') ?></div>
    <span class="stat-value"><?= $reviewCount ?></span>
    <span class="stat-label"><?= $reviewCount > 0 ? 'Awaiting a decision' : 'Nothing to review' ?></span>
  </a>
  <a class="card stat <?= $depositCount > 0 ? 'attention' : '' ?>" href="<?= e(wayfairs_url('/admin/deposits')) ?>">
    <div class="stat-head"><span class="eyebrow">Deposits</span><?= wayfairs_icon('deposit') ?></div>
    <span class="stat-value"><?= $depositCount ?></span>
    <span class="stat-label"><?= $depositCount > 0 ? 'Pending verification' : 'Queue clear' ?></span>
  </a>
  <a class="card stat <?= $withdrawalCount > 0 ? 'attention' : '' ?>" href="<?= e(wayfairs_url('/admin/withdrawals')) ?>">
    <div class="stat-head"><span class="eyebrow">Withdrawals</span><?= wayfairs_icon('withdraw') ?></div>
    <span class="stat-value"><?= $withdrawalCount ?></span>
    <span class="stat-label"><?= $withdrawalCount > 0 ? 'Pending or approved' : 'Queue clear' ?></span>
  </a>
</section>

<section class="grid two">
  <article class="card">
    <div class="section-head" style="margin-bottom:.75rem">
      <div><h2>Deposit queue</h2><p>Verify the received funds before approving.</p></div>
      <a class="btn small ghost" href="<?= e(wayfairs_url('/admin/deposits')) ?>">Open queue</a>
    </div>
    <?php if ($pendingDeposits === []): ?>
      <div class="queue-empty"><?= wayfairs_icon('check') ?> No deposits are waiting for verification.</div>
    <?php else: ?>
      <div class="queue-list">
        <?php foreach ($pendingDeposits as $deposit): ?>
          <a class="queue-item" href="<?= e(wayfairs_url('/admin/deposits')) ?>">
            <span class="queue-main">
              <strong><?= e(trim((string) $deposit['first_name'] . ' ' . (string) $deposit['last_name'])) ?></strong>
              <span><?= e((string) $deposit['email']) ?> · <?= e(wayfairs_datetime((string) $deposit['created_at'])) ?></span>
            </span>
            <span class="queue-amount"><?= e(wayfairs_amount((int) $deposit['amount_minor'], (int) $deposit['asset_scale'], (string) $deposit['asset_symbol'], (string) $deposit['asset_code'])) ?></span>
          </a>
        <?php endforeach; ?>
      </div>
      <?php if ($depositCount > count($pendingDeposits)): ?>
        <p class="hint" style="margin-top:.7rem">Showing the oldest <?= count($pendingDeposits) ?> of <?= $depositCount ?> pending deposits.</p>
      <?php endif; ?>
    <?php endif; ?>
  </article>

  <article class="card">
    <div class="section-head" style="margin-bottom:.75rem">
      <div><h2>Withdrawal queue</h2><p>Complete the payout externally, then record the decision.</p></div>
      <a class="btn small ghost" href="<?= e(wayfairs_url('/admin/withdrawals')) ?>">Open queue</a>
    </div>
    <?php if ($pendingWithdrawals === []): ?>
      <div class="queue-empty"><?= wayfairs_icon('check') ?> No withdrawals are waiting to be completed.</div>
    <?php else: ?>
      <div class="queue-list">
        <?php foreach ($pendingWithdrawals as $withdrawal): ?>
          <a class="queue-item" href="<?= e(wayfairs_url('/admin/withdrawals')) ?>">
            <span class="queue-main">
              <strong><?= e(trim((string) $withdrawal['first_name'] . ' ' . (string) $withdrawal['last_name'])) ?></strong>
              <span><?= e((string) $withdrawal['email']) ?> · <?= e(wayfairs_datetime((string) $withdrawal['created_at'])) ?><?= (int) $withdrawal['fee_minor'] > 0 ? ' · fee ' . e(wayfairs_amount((int) $withdrawal['fee_minor'], (int) $withdrawal['asset_scale'], (string) $withdrawal['asset_symbol'])) : '' ?></span>
            </span>
            <span class="queue-amount"><?= e(wayfairs_amount((int) $withdrawal['amount_minor'], (int) $withdrawal['asset_scale'], (string) $withdrawal['asset_symbol'], (string) $withdrawal['asset_code'])) ?></span>
          </a>
        <?php endforeach; ?>
      </div>
      <?php if ($withdrawalCount > count($pendingWithdrawals)): ?>
        <p class="hint" style="margin-top:.7rem">Showing the oldest <?= count($pendingWithdrawals) ?> of <?= $withdrawalCount ?> open withdrawals.</p>
      <?php endif; ?>
    <?php endif; ?>
  </article>
</section>

<section class="grid two">
  <article class="card">
    <div class="section-head" style="margin-bottom:.75rem">
      <div><h2>Recent customers</h2><p>Newest registrations and their verification state.</p></div>
      <a class="btn small ghost" href="<?= e(wayfairs_url('/admin/users')) ?>">All customers</a>
    </div>
    <?php if ($recentCustomers === []): ?>
      <div class="queue-empty"><?= wayfairs_icon('customers') ?> No customer accounts yet.</div>
    <?php else: ?>
      <div class="queue-list">
        <?php foreach ($recentCustomers as $customer): ?>
          <a class="queue-item" href="<?= e(wayfairs_url('/admin/users/' . $customer['id'])) ?>">
            <span class="queue-main">
              <strong><?= e(trim((string) $customer['first_name'] . ' ' . (string) $customer['last_name'])) ?></strong>
              <span><?= e((string) $customer['email']) ?> · joined <?= e(wayfairs_datetime((string) $customer['created_at'])) ?></span>
            </span>
            <span class="queue-amount"><?= wayfairs_pill('kyc ' . (string) ($customer['kyc_status'] ?? 'not_started')) ?></span>
          </a>
        <?php endforeach; ?>
      </div>
    <?php endif; ?>
  </article>

  <article class="card">
    <h2>How decisions are recorded</h2>
    <ul class="stack tight" style="margin:.75rem 0 0;padding-left:1.2rem;color:var(--muted);font-size:.9rem">
      <li>Deposits are credited only after observed receipt, with the external reference recorded.</li>
      <li>Withdrawals are debited only after the payout is completed externally; rejecting releases the reservation.</li>
      <li>Every decision requires a reason and is written to the audit log.</li>
      <li>Support impersonation is visible, time-limited, and cannot perform financial or security mutations.</li>
    </ul>
    <div class="section-actions" style="margin-top:1rem">
      <a class="btn small ghost" href="<?= e(wayfairs_url('/admin/assets')) ?>"><?= wayfairs_icon('layers', 'btn-icon') ?> Currencies</a>
      <a class="btn small ghost" href="<?= e(wayfairs_url('/admin/settings')) ?>"><?= wayfairs_icon('settings', 'btn-icon') ?> Site information</a>
    </div>
  </article>
</section>
