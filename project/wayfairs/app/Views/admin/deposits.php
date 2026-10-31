<?php

declare(strict_types=1);

$pendingDeposits = array_values(array_filter($deposits, static fn (array $d): bool => in_array((string) $d['status'], ['pending', 'reviewing'], true)));
$decidedDeposits = array_values(array_filter($deposits, static fn (array $d): bool => !in_array((string) $d['status'], ['pending', 'reviewing'], true)));
?>
<div class="section-head">
  <div>
    <p class="eyebrow">Money in</p>
    <h1>Deposits</h1>
    <p>Confirm the funds actually arrived before crediting. Each decision requires a reason and is written to the audit log.</p>
  </div>
  <div class="section-actions">
    <span class="pill <?= $pendingDeposits !== [] ? 'warn' : 'good' ?>"><?= count($pendingDeposits) ?> awaiting verification</span>
  </div>
</div>

<?php if ($pendingDeposits === []): ?>
  <div class="notice good">
    <?= wayfairs_icon('check') ?>
    <div><strong>No deposits are waiting</strong><p>New deposit requests appear here as soon as a customer submits one.</p></div>
  </div>
<?php else: ?>
  <section class="decision-list">
    <?php foreach ($pendingDeposits as $d): ?>
      <article class="card decision-card">
        <div class="decision-head">
          <div>
            <p class="eyebrow">Pending deposit</p>
            <h2><?= e(wayfairs_amount((int) $d['amount_minor'], (int) $d['asset_scale'], (string) $d['asset_symbol'], (string) $d['asset_code'])) ?></h2>
            <p class="hint"><?= e(trim((string) $d['first_name'] . ' ' . (string) $d['last_name'])) ?> · <?= e((string) $d['email']) ?></p>
          </div>
          <div class="decision-side">
            <?= wayfairs_pill((string) $d['status']) ?>
            <span class="hint"><?= e(wayfairs_datetime((string) $d['created_at'])) ?></span>
          </div>
        </div>

        <dl class="decision-facts">
          <div><dt>Credited account</dt><dd class="mono"><?= e((string) $d['account_number']) ?></dd></div>
          <div><dt>Sender reference</dt><dd><?= e(trim((string) ($d['sender_reference'] ?? '')) !== '' ? (string) $d['sender_reference'] : '—') ?></dd></div>
          <div><dt>Type</dt><dd><?= e((string) $d['deposit_type']) ?></dd></div>
        </dl>

        <form class="decision-form" method="post" action="<?= e(wayfairs_url('/admin/deposits/' . $d['id'] . '/decision')) ?>">
          <input type="hidden" name="_token" value="<?= e(wayfairs_csrf()) ?>" />
          <label>External reference
            <input name="external_reference" maxlength="200" placeholder="Recorded when you credit (bank or chain reference)" />
          </label>
          <label>Reason for decision
            <input name="reason" minlength="5" maxlength="300" required placeholder="What you verified before deciding" />
          </label>
          <div class="decision-actions">
            <button class="btn" name="decision" value="approve" type="submit"><?= wayfairs_icon('check', 'btn-icon') ?> Credit deposit</button>
            <button class="btn danger" name="decision" value="reject" type="submit">Reject</button>
          </div>
        </form>
      </article>
    <?php endforeach; ?>
  </section>
<?php endif; ?>

<section class="card">
  <div class="section-head" style="margin-bottom:.75rem">
    <div><h2>Decision history</h2><p>Completed and rejected deposits, newest first.</p></div>
  </div>
  <?php if ($decidedDeposits === []): ?>
    <p class="muted">No deposits have been decided yet.</p>
  <?php else: ?>
    <div class="table-wrap"><table>
      <thead><tr><th>Submitted</th><th>Customer</th><th>Asset</th><th>Amount</th><th>Reference</th><th>Status</th><th>Reason</th></tr></thead>
      <tbody><?php foreach ($decidedDeposits as $d): ?>
        <tr>
          <td><?= e(wayfairs_datetime((string) $d['created_at'])) ?></td>
          <td><?= e(trim((string) $d['first_name'] . ' ' . (string) $d['last_name'])) ?><div class="hint"><?= e((string) $d['email']) ?></div></td>
          <td><?= e((string) $d['asset_code']) ?></td>
          <td><?= e(wayfairs_amount((int) $d['amount_minor'], (int) $d['asset_scale'], (string) $d['asset_symbol'])) ?></td>
          <td class="wrap-anywhere"><?= e(trim((string) ($d['external_reference'] ?? '')) !== '' ? (string) $d['external_reference'] : '—') ?></td>
          <td><?= wayfairs_pill((string) $d['status']) ?></td>
          <td class="wrap-anywhere"><?= e(trim((string) ($d['review_reason'] ?? '')) !== '' ? (string) $d['review_reason'] : '—') ?></td>
        </tr>
      <?php endforeach; ?></tbody>
    </table></div>
  <?php endif; ?>
</section>
