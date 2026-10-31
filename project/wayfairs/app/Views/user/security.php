<?php

declare(strict_types=1);
?>
<div class="section-head"><div><p class="eyebrow">Security</p><h1>Account security</h1></div></div>
<section class="card">
  <h2>Active restrictions</h2>
  <?php if ($restrictions === []): ?>
    <p class="muted">None. Your account has no active restrictions.</p>
  <?php else: ?>
    <ul><?php foreach ($restrictions as $r): ?>
      <li><strong><?= e(str_replace('_', ' ', (string) $r['capability'])) ?></strong> — <?= e((string) $r['reason']) ?> <span class="hint">since <?= e(wayfairs_datetime((string) $r['starts_at'])) ?></span></li>
    <?php endforeach; ?></ul>
  <?php endif; ?>
</section>
<section class="card">
  <h2>Sessions</h2>
  <p class="muted">Your session stays signed in for up to 12 hours from sign-in. Use Sign out to end it on this device.</p>
</section>
