<?php

declare(strict_types=1);

$status = (string) ($profile['status'] ?? 'not_started');
$locked = in_array($status, ['pending', 'in_review', 'verified'], true);
?>
<div class="section-head"><div><p class="eyebrow">Identity verification</p><h1>Verification</h1></div>
<?= wayfairs_pill('kyc ' . $status) ?></div>
<?php if (!empty($profile['review_reason'])): ?>
  <div class="card"><strong>Review note</strong><p class="muted"><?= e((string) $profile['review_reason']) ?></p></div>
<?php endif; ?>
<article class="card">
  <?php if ($locked): ?>
    <p>Your details were submitted on <?= e(wayfairs_datetime($profile['submitted_at'] ?? null)) ?>. Reference <code><?= e((string) ($profile['submission_reference'] ?? '')) ?></code>.</p>
    <p class="hint">You cannot edit details while the review is open.</p>
  <?php else: ?>
    <form class="stack" method="post" action="<?= e(wayfairs_url('/kyc')) ?>">
      <input type="hidden" name="_token" value="<?= e(wayfairs_csrf()) ?>" />
      <div class="row">
        <label>Date of birth<input type="date" name="date_of_birth" required /></label>
        <label>Country (ISO code)<input name="country_code" maxlength="2" placeholder="NG" required /></label>
      </div>
      <label>Address<input name="address_line1" maxlength="200" required /></label>
      <label>Address line 2 (optional)<input name="address_line2" maxlength="200" /></label>
      <div class="row">
        <label>City<input name="city" maxlength="120" required /></label>
        <label>State / region<input name="region" maxlength="120" required /></label>
        <label>Postal code<input name="postal_code" maxlength="30" required /></label>
      </div>
      <div class="row">
        <label>ID type
          <select name="id_type" required>
            <option value="national_id">National ID</option>
            <option value="passport">Passport</option>
            <option value="drivers_licence">Driver's licence</option>
          </select>
        </label>
        <label>Last 4 characters of ID number<input name="id_last4" maxlength="8" required /></label>
      </div>
      <p class="hint">We store only the last four characters of your ID. Full document checks are completed by our verification team.</p>
      <button class="btn" type="submit">Submit for review</button>
    </form>
  <?php endif; ?>
</article>
