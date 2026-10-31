<?php

declare(strict_types=1);

$kycStatus = (string) ($kyc['status'] ?? 'not_started');
$customerName = trim($profile['first_name'] . ' ' . $profile['last_name']);
?>
<div class="section-head">
  <div><p class="eyebrow">Customer</p><h1><?= e($customerName) ?></h1><p class="muted"><?= e((string) $profile['email']) ?> · joined <?= e(wayfairs_datetime((string) $profile['created_at'])) ?></p></div>
  <div class="row" style="flex:0 0 auto">
    <?= wayfairs_pill((string) $profile['status']) ?>
    <?= wayfairs_pill('kyc ' . $kycStatus) ?>
  </div>
</div>

<section class="grid two">
  <article class="card">
    <h2>Support access</h2>
    <p class="hint">Opens this customer's account view for 30 minutes. Your own administrator password and a reason are required. Every action is recorded against both identities. Money movement and security changes are disabled while you are viewing.</p>
    <form class="stack" method="post" action="<?= e(wayfairs_url('/admin/impersonate/' . $profile['id'])) ?>">
      <input type="hidden" name="_token" value="<?= e(wayfairs_csrf()) ?>" />
      <label>Reason<input name="reason" minlength="10" maxlength="300" required /></label>
      <label>Your administrator password<input type="password" name="password" autocomplete="current-password" required /></label>
      <button class="btn danger" type="submit">Log in as this customer</button>
    </form>
  </article>

  <article class="card">
    <h2>Verification decision</h2>
    <p class="muted">Status: <?= e(str_replace('_', ' ', $kycStatus)) ?></p>
    <?php if (!empty($kyc['id_last4'])): ?>
      <dl class="kv">
        <dt>Name</dt><dd><?= e($customerName) ?></dd>
        <dt>Date of birth</dt><dd><?= e((string) ($kyc['date_of_birth'] ?? '—')) ?></dd>
        <dt>Country</dt><dd><?= e((string) ($kyc['country_code'] ?? '—')) ?></dd>
        <dt>Address</dt><dd><?= e(trim(($kyc['address_line1'] ?? '') . ', ' . ($kyc['city'] ?? '') . ' ' . ($kyc['region'] ?? '') . ' ' . ($kyc['postal_code'] ?? ''), ', ')) ?></dd>
        <dt>ID</dt><dd><?= e((string) ($kyc['id_type'] ?? '')) ?> · ending <?= e((string) $kyc['id_last4']) ?></dd>
      </dl>
    <?php else: ?>
      <p class="muted">No verification details submitted.</p>
    <?php endif; ?>
    <form class="stack" method="post" action="<?= e(wayfairs_url('/admin/users/' . $profile['id'] . '/kyc')) ?>" style="margin-top:.8rem">
      <input type="hidden" name="_token" value="<?= e(wayfairs_csrf()) ?>" />
      <label>Decision
        <select name="status" required>
          <option value="verified">Approve</option>
          <option value="needs_resubmission">Request resubmission</option>
          <option value="rejected">Reject</option>
          <option value="expired">Mark expired</option>
        </select>
      </label>
      <label>Reason (shown to the customer)<input name="reason" minlength="10" maxlength="300" required /></label>
      <button class="btn small" type="submit">Record decision</button>
    </form>
  </article>
</section>

<section class="card">
  <h2>Restrictions</h2>
  <?php if ($restrictions === []): ?><p class="muted">No active restrictions.</p><?php else: ?>
  <div class="table-wrap"><table>
    <thead><tr><th>Capability</th><th>Reason</th><th>Since</th><th></th></tr></thead>
    <tbody><?php foreach ($restrictions as $r): ?>
      <tr>
        <td><?= e(str_replace('_', ' ', (string) $r['capability'])) ?></td>
        <td><?= e((string) $r['reason']) ?></td>
        <td><?= e(wayfairs_datetime((string) $r['starts_at'])) ?></td>
        <td>
          <form class="row" method="post" action="<?= e(wayfairs_url('/admin/restrictions/' . $r['id'] . '/release')) ?>">
            <input type="hidden" name="_token" value="<?= e(wayfairs_csrf()) ?>" />
            <input type="hidden" name="user_id" value="<?= e((string) $profile['id']) ?>" />
            <input name="reason" minlength="10" placeholder="Release reason" required />
            <button class="btn small ghost" type="submit">Release</button>
          </form>
        </td>
      </tr>
    <?php endforeach; ?></tbody>
  </table></div>
  <?php endif; ?>
  <form class="stack" method="post" action="<?= e(wayfairs_url('/admin/users/' . $profile['id'] . '/restrict')) ?>" style="margin-top:1rem">
    <input type="hidden" name="_token" value="<?= e(wayfairs_csrf()) ?>" />
    <div class="row">
      <label>Capability
        <select name="capability" required>
          <option value="fiat_deposit">Fiat deposits</option>
          <option value="fiat_withdrawal">Fiat withdrawals</option>
          <option value="crypto_deposit">Crypto deposits</option>
          <option value="crypto_withdrawal">Crypto withdrawals</option>
          <option value="internal_transfer">Transfers</option>
          <option value="invoice">Invoices</option>
          <option value="login">Sign-in</option>
        </select>
      </label>
      <label>Reason code
        <select name="reason_code">
          <option value="manual_review">Manual review</option>
          <option value="fraud_risk">Fraud risk</option>
          <option value="sanctions_hold">Sanctions hold</option>
          <option value="customer_request">Customer request</option>
        </select>
      </label>
    </div>
    <label>Detail (required)<input name="reason" minlength="10" maxlength="300" required /></label>
    <button class="btn small danger" type="submit">Apply restriction</button>
  </form>
</section>

<section class="card">
  <h2>Accounts</h2>
  <?php if ($accounts === []): ?><p class="muted">No accounts opened yet.</p><?php else: ?>
  <div class="table-wrap"><table>
    <thead><tr><th>Asset</th><th>Account</th><th>Available</th><th>Status</th></tr></thead>
    <tbody><?php foreach ($accounts as $a): ?>
      <tr>
        <td><?= e((string) $a['code']) ?></td>
        <td><?= e((string) $a['account_number']) ?></td>
        <td><?= e(wayfairs_amount((int) $a['available_minor'], (int) $a['scale'], (string) $a['symbol'])) ?></td>
        <td><?= wayfairs_pill((string) $a['status']) ?></td>
      </tr>
    <?php endforeach; ?></tbody>
  </table></div>
  <?php endif; ?>
</section>

<section class="card">
  <h2>Transactions</h2>
  <?php if ($history === []): ?><p class="muted">No transactions.</p><?php else: ?>
  <div class="table-wrap"><table>
    <thead><tr><th>Date</th><th>Reference</th><th>Type</th><th>Amount</th><th>Status</th></tr></thead>
    <tbody><?php foreach ($history as $t): ?>
      <tr>
        <td><?= e(wayfairs_datetime((string) $t['created_at'])) ?></td>
        <td><?= e((string) $t['public_reference']) ?></td>
        <td><?= e(str_replace('_', ' ', (string) $t['transaction_type'])) ?></td>
        <td><?= e(wayfairs_amount((int) $t['amount_minor'], (int) $t['asset_scale'], (string) $t['asset_symbol'], (string) $t['asset_code'])) ?></td>
        <td><?= wayfairs_pill((string) $t['status']) ?></td>
      </tr>
    <?php endforeach; ?></tbody>
  </table></div>
  <?php endif; ?>
</section>
