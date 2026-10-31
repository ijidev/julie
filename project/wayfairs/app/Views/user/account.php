<?php

declare(strict_types=1);

$asset = $account['asset'];
?>
<div class="section-head">
  <div><p class="eyebrow"><?= e($asset['asset_type'] === 'crypto' ? 'Digital asset' : 'Fiat currency') ?></p><h1><?= e($asset['name']) ?> account</h1></div>
  <a class="btn ghost small" href="<?= e(wayfairs_url('/dashboard')) ?>">Back to overview</a>
</div>
<section class="grid two">
  <article class="card">
    <p class="muted">Available balance</p>
    <div class="balance"><?= e(wayfairs_amount((int) $account['available_minor'], (int) $asset['scale'], (string) $asset['symbol'], (string) $asset['code'])) ?></div>
    <p class="hint">Available excludes amounts reserved for pending withdrawals.</p>
  </article>
  <article class="card">
    <dl class="kv">
      <dt>Account number</dt><dd><?= e($account['account_number']) ?></dd>
      <dt>Status</dt><dd><?= wayfairs_pill((string) $account['status']) ?></dd>
      <dt>Opened</dt><dd><?= e(wayfairs_datetime((string) $account['created_at'])) ?></dd>
    </dl>
  </article>
</section>
<section class="card">
  <h2>Statement</h2>
  <?php if ($history === []): ?><p class="muted">No activity on this account yet.</p><?php else: ?>
  <div class="table-wrap"><table>
    <thead><tr><th>Date</th><th>Description</th><th>Amount</th><th>Fee</th><th>Status</th><th></th></tr></thead>
    <tbody>
    <?php foreach ($history as $row): ?>
      <tr>
        <td><?= e(wayfairs_datetime((string) $row['created_at'])) ?></td>
        <td><?= e((string) $row['description']) ?><div class="hint"><?= e((string) $row['public_reference']) ?></div></td>
        <td><?= e(($row['direction'] === 'credit' ? '+' : '−') . wayfairs_amount((int) $row['amount_minor'], (int) $asset['scale'], (string) $asset['symbol'])) ?></td>
        <td><?= e((int) $row['fee_minor'] > 0 ? wayfairs_amount((int) $row['fee_minor'], (int) $asset['scale'], (string) $asset['symbol']) : '—') ?></td>
        <td><?= wayfairs_pill((string) $row['status']) ?></td>
        <td><a href="<?= e(wayfairs_url('/receipts/' . $row['id'])) ?>">Receipt</a></td>
      </tr>
    <?php endforeach; ?>
    </tbody>
  </table></div>
  <?php endif; ?>
</section>
