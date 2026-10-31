<?php

declare(strict_types=1);
?>
<div class="section-head"><div><p class="eyebrow">Payment requests</p><h1>Invoices</h1></div></div>
<section class="grid two">
  <article class="card">
    <h2>Request payment</h2>
    <form class="stack" method="post" action="<?= e(wayfairs_url('/invoices')) ?>">
      <input type="hidden" name="_token" value="<?= e(wayfairs_csrf()) ?>" />
      <label>Title<input name="title" maxlength="200" required /></label>
      <label>Description (optional)<textarea name="description" rows="2" maxlength="2000"></textarea></label>
      <div class="row">
        <label>Asset
          <select name="asset_code" required>
            <?php foreach ($accounts as $account): $asset = $account['asset']; ?>
              <option value="<?= e($asset['code']) ?>"><?= e($asset['code']) ?></option>
            <?php endforeach; ?>
          </select>
        </label>
        <label>Amount<input name="amount" inputmode="decimal" required /></label>
      </div>
      <label>Due (optional)<input type="datetime-local" name="due_at" /></label>
      <button class="btn" type="submit">Create invoice</button>
    </form>
  </article>
  <article class="card">
    <h2>Pay an invoice</h2>
    <form class="stack" method="post" action="<?= e(wayfairs_url('/invoices/pay')) ?>">
      <input type="hidden" name="_token" value="<?= e(wayfairs_csrf()) ?>" />
      <input type="hidden" name="idem" value="<?= e(wayfairs_idem()) ?>" />
      <label>Invoice code<input name="code" placeholder="INV-…" required /></label>
      <button class="btn" type="submit">Pay from my account</button>
    </form>
    <p class="hint">Payment uses the invoice's asset and is recorded as a transfer with a receipt.</p>
  </article>
</section>
<section class="card">
  <h2>Invoices you issued</h2>
  <?php if ($issued === []): ?><p class="muted">None yet.</p><?php else: ?>
  <div class="table-wrap"><table>
    <thead><tr><th>Code</th><th>Title</th><th>Amount</th><th>Due</th><th>Status</th></tr></thead>
    <tbody><?php foreach ($issued as $i): ?>
      <tr>
        <td><code><?= e((string) $i['public_code']) ?></code></td>
        <td><?= e((string) $i['title']) ?></td>
        <td><?= e(wayfairs_amount((int) $i['amount_minor'], (int) $i['asset_scale'], (string) $i['asset_symbol'], (string) $i['asset_code'])) ?></td>
        <td><?= e($i['due_at'] ? wayfairs_datetime((string) $i['due_at']) : '—') ?></td>
        <td><?= wayfairs_pill((string) $i['status']) ?></td>
      </tr>
    <?php endforeach; ?></tbody>
  </table></div>
  <?php endif; ?>
</section>
<section class="card">
  <h2>Invoices you paid</h2>
  <?php if ($paid === []): ?><p class="muted">None yet.</p><?php else: ?>
  <ul>
    <?php foreach ($paid as $i): ?>
      <li><?= e((string) $i['title']) ?> — <?= e(wayfairs_amount((int) $i['amount_minor'], (int) $i['asset_scale'], (string) $i['asset_symbol'], (string) $i['asset_code'])) ?> · <?= e(wayfairs_datetime($i['paid_at'] ?? null)) ?></li>
    <?php endforeach; ?>
  </ul>
  <?php endif; ?>
</section>
