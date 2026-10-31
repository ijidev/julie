<?php

declare(strict_types=1);

$r = $receipt;
$amount = wayfairs_amount((int) $r['amount_minor'], (int) $r['asset_scale'], (string) $r['asset_symbol'], (string) $r['asset_code']);
$fee = (int) $r['fee_minor'] > 0 ? wayfairs_amount((int) $r['fee_minor'], (int) $r['asset_scale'], (string) $r['asset_symbol'], (string) $r['asset_code']) : null;
?>
<div class="section-head"><div><p class="eyebrow">Receipt</p><h1><?= e($r['public_reference']) ?></h1></div>
<button class="btn ghost small" type="button" onclick="window.print()">Print</button></div>
<article class="card">
  <dl class="kv">
    <dt>Status</dt><dd><?= wayfairs_pill((string) $r['status']) ?></dd>
    <dt>Type</dt><dd><?= e(str_replace('_', ' ', (string) $r['transaction_type'])) ?></dd>
    <dt>Description</dt><dd><?= e((string) $r['description']) ?></dd>
    <dt>Amount</dt><dd><?= e(($r['direction'] === 'credit' ? '+' : '−') . $amount) ?></dd>
    <?php if ($fee !== null): ?><dt>Fee</dt><dd><?= e($fee) ?></dd><?php endif; ?>
    <?php if (!empty($r['counterparty_label'])): ?><dt>Counterparty</dt><dd><?= e((string) $r['counterparty_label']) ?></dd><?php endif; ?>
    <dt>Account</dt><dd><?= e((string) $r['account_number']) ?></dd>
    <dt>Created</dt><dd><?= e(wayfairs_datetime((string) $r['created_at'])) ?></dd>
    <dt>Completed</dt><dd><?= e(wayfairs_datetime($r['completed_at'] ?? null)) ?></dd>
  </dl>
</article>
