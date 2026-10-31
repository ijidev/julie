<?php

declare(strict_types=1);

$openWithdrawals = array_values(array_filter($withdrawals, static fn (array $w): bool => in_array((string) $w['status'], ['pending', 'approved'], true)));
$decidedWithdrawals = array_values(array_filter($withdrawals, static fn (array $w): bool => !in_array((string) $w['status'], ['pending', 'approved'], true)));
?>
<div class="section-head">
  <div>
    <p class="eyebrow">Money out</p>
    <h1>Withdrawals</h1>
    <p>Send the payout externally first, then record the decision with its settlement reference. Rejecting releases the reserved amount.</p>
  </div>
  <div class="section-actions">
    <span class="pill <?= $openWithdrawals !== [] ? 'warn' : 'good' ?>"><?= count($openWithdrawals) ?> open</span>
  </div>
</div>

<?php if ($openWithdrawals === []): ?>
  <div class="notice good">
    <?= wayfairs_icon('check') ?>
    <div><strong>No withdrawals are waiting</strong><p>New withdrawal requests appear here with their destination and reserved amount.</p></div>
  </div>
<?php else: ?>
  <section class="decision-list">
    <?php foreach ($openWithdrawals as $w): ?>
      <article class="card decision-card">
        <div class="decision-head">
          <div>
            <p class="eyebrow">Withdrawal to send</p>
            <h2><?= e(wayfairs_amount((int) $w['amount_minor'], (int) $w['asset_scale'], (string) $w['asset_symbol'], (string) $w['asset_code'])) ?></h2>
            <p class="hint">
              <?= e(trim((string) $w['first_name'] . ' ' . (string) $w['last_name'])) ?> · <?= e((string) $w['email']) ?>
              <?php if ((int) $w['fee_minor'] > 0): ?>
                · fee <?= e(wayfairs_amount((int) $w['fee_minor'], (int) $w['asset_scale'], (string) $w['asset_symbol'])) ?>
              <?php endif; ?>
            </p>
          </div>
          <div class="decision-side">
            <?= wayfairs_pill((string) $w['status']) ?>
            <span class="hint"><?= e(wayfairs_datetime((string) $w['created_at'])) ?></span>
          </div>
        </div>

        <dl class="decision-facts">
          <div><dt>Total reserved</dt><dd><?= e(wayfairs_amount((int) $w['amount_minor'] + (int) $w['fee_minor'], (int) $w['asset_scale'], (string) $w['asset_symbol'], (string) $w['asset_code'])) ?></dd></div>
          <div class="wide"><dt>Destination</dt><dd class="wrap-anywhere"><?= e((string) $w['destination_summary']) ?></dd></div>
        </dl>

        <form class="decision-form" method="post" action="<?= e(wayfairs_url('/admin/withdrawals/' . $w['id'] . '/decision')) ?>">
          <input type="hidden" name="_token" value="<?= e(wayfairs_csrf()) ?>" />
          <label>Settlement reference
            <input name="external_reference" maxlength="200" placeholder="Recorded when you mark sent (payout or chain reference)" />
          </label>
          <label>Reason for decision
            <input name="reason" minlength="5" maxlength="300" required placeholder="What you verified before deciding" />
          </label>
          <div class="decision-actions">
            <button class="btn" name="decision" value="approve" type="submit"><?= wayfairs_icon('check', 'btn-icon') ?> Mark sent</button>
            <button class="btn danger" name="decision" value="reject" type="submit">Reject &amp; release</button>
          </div>
        </form>
      </article>
    <?php endforeach; ?>
  </section>
<?php endif; ?>

<section class="card">
  <div class="section-head" style="margin-bottom:.75rem">
    <div><h2>Decision history</h2><p>Completed and rejected withdrawals, newest first.</p></div>
  </div>
  <?php if ($decidedWithdrawals === []): ?>
    <p class="muted">No withdrawals have been decided yet.</p>
  <?php else: ?>
    <div class="table-wrap"><table>
      <thead><tr><th>Submitted</th><th>Customer</th><th>Asset</th><th>Amount + fee</th><th>Destination</th><th>Status</th><th>Reference</th></tr></thead>
      <tbody><?php foreach ($decidedWithdrawals as $w): ?>
        <tr>
          <td><?= e(wayfairs_datetime((string) $w['created_at'])) ?></td>
          <td><?= e(trim((string) $w['first_name'] . ' ' . (string) $w['last_name'])) ?><div class="hint"><?= e((string) $w['email']) ?></div></td>
          <td><?= e((string) $w['asset_code']) ?></td>
          <td><?= e(wayfairs_amount((int) $w['amount_minor'] + (int) $w['fee_minor'], (int) $w['asset_scale'], (string) $w['asset_symbol'])) ?></td>
          <td class="wrap-anywhere"><?= e((string) $w['destination_summary']) ?></td>
          <td><?= wayfairs_pill((string) $w['status']) ?></td>
          <td class="wrap-anywhere"><?= e(trim((string) ($w['external_reference'] ?? '')) !== '' ? (string) $w['external_reference'] : (string) ($w['review_reason'] ?? '—')) ?></td>
        </tr>
      <?php endforeach; ?></tbody>
    </table></div>
  <?php endif; ?>
</section>
