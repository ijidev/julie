<?php

declare(strict_types=1);
?>
<div class="section-head"><div><p class="eyebrow">Configuration</p><h1>Site information</h1></div></div>
<form class="stack" method="post" action="<?= e(wayfairs_url('/admin/settings')) ?>">
  <input type="hidden" name="_token" value="<?= e(wayfairs_csrf()) ?>" />
  <section class="card stack">
    <h2>Brand</h2>
    <div class="row">
      <label>Bank name<input name="site_name" value="<?= e($values['site.name'] ?? 'Wayfairs') ?>" required maxlength="120" /></label>
      <label>Tagline<input name="site_tagline" value="<?= e($values['site.tagline'] ?? '') ?>" maxlength="200" /></label>
    </div>
    <div class="row">
      <label>Primary colour<input name="site_primary_color" value="<?= e($values['site.primary_color'] ?? '#0f8b6d') ?>" pattern="#[0-9a-fA-F]{6}" /></label>
      <label>Accent colour<input name="site_accent_color" value="<?= e($values['site.accent_color'] ?? '#f0b429') ?>" pattern="#[0-9a-fA-F]{6}" /></label>
    </div>
  </section>
  <section class="card stack">
    <h2>Contact</h2>
    <div class="row">
      <label>Support email<input type="email" name="site_support_email" value="<?= e($values['site.support_email'] ?? '') ?>" /></label>
      <label>Support phone<input name="site_support_phone" value="<?= e($values['site.support_phone'] ?? '') ?>" maxlength="40" /></label>
    </div>
    <label>Registered address<textarea name="site_address" rows="2" maxlength="300"><?= e($values['site.address'] ?? '') ?></textarea></label>
  </section>
  <section class="card stack">
    <h2>Customer notices</h2>
    <label>Fiat deposit instructions<textarea name="site_deposit_instructions_fiat" rows="2" maxlength="1000"><?= e($values['site.deposit_instructions_fiat'] ?? '') ?></textarea></label>
    <label>Crypto deposit instructions<textarea name="site_deposit_instructions_crypto" rows="2" maxlength="1000"><?= e($values['site.deposit_instructions_crypto'] ?? '') ?></textarea></label>
    <label>Withdrawal notice<textarea name="site_withdrawal_notice" rows="2" maxlength="1000"><?= e($values['site.withdrawal_notice'] ?? '') ?></textarea></label>
    <label>Verification notice<textarea name="site_kyc_notice" rows="2" maxlength="1000"><?= e($values['site.kyc_notice'] ?? '') ?></textarea></label>
    <label>Footer text<textarea name="site_footer" rows="2" maxlength="1000"><?= e($values['site.footer'] ?? '') ?></textarea></label>
  </section>
  <button class="btn" type="submit">Save site information</button>
</form>
