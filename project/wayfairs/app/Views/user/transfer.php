<?php

declare(strict_types=1);
?>
<div class="section-head"><div><p class="eyebrow">Send money</p><h1>Transfer</h1></div></div>
<section class="grid two">
  <article class="card">
    <h2>Send to a Wayfairs customer</h2>
    <form class="stack" method="post" action="<?= e(wayfairs_url('/transfer')) ?>">
      <input type="hidden" name="_token" value="<?= e(wayfairs_csrf()) ?>" />
      <input type="hidden" name="idem" value="<?= e(wayfairs_idem()) ?>" />
      <label>Recipient email<input type="email" name="recipient_email" required /></label>
      <label>Asset
        <select name="asset_code" required>
          <?php foreach ($accounts as $account): $asset = $account['asset']; ?>
            <option value="<?= e($asset['code']) ?>"><?= e($asset['name']) ?> (<?= e($asset['code']) ?>) — <?= e(wayfairs_amount((int) $account['available_minor'], (int) $asset['scale'], (string) $asset['symbol'])) ?></option>
          <?php endforeach; ?>
        </select>
      </label>
      <label>Amount<input name="amount" inputmode="decimal" placeholder="0.00" required /></label>
      <label>Note (optional)<input name="note" maxlength="200" /></label>
      <button class="btn" type="submit">Send</button>
    </form>
  </article>
  <article class="card">
    <h2>Good to know</h2>
    <p class="hint">Transfers settle immediately between Wayfairs accounts. Fees, if any, are shown on each receipt. You cannot send to yourself.</p>
  </article>
</section>
<section class="card">
  <h2>Transfer history</h2>
  <?php if ($transfers === []): ?><p class="muted">No transfers yet.</p><?php else: ?>
  <div class="table-wrap"><table>
    <thead><tr><th>Date</th><th>Direction</th><th>Counterparty</th><th>Amount</th><th>Note</th></tr></thead>
    <tbody><?php foreach ($transfers as $t): $sent = $t['sender_user_id'] === $me; ?>
      <tr>
        <td><?= e(wayfairs_datetime((string) $t['created_at'])) ?></td>
        <td><?= $sent ? 'Sent' : 'Received' ?></td>
        <td><?= e($sent ? (string) $t['recipient_email'] : (string) $t['sender_email']) ?></td>
        <td><?= e(($sent ? '−' : '+') . wayfairs_amount((int) $t['amount_minor'], (int) $t['asset_scale'], (string) $t['asset_symbol'], (string) $t['asset_code'])) ?></td>
        <td><?= e((string) ($t['note'] ?? '')) ?></td>
      </tr>
    <?php endforeach; ?></tbody>
  </table></div>
  <?php endif; ?>
</section>
