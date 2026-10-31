<?php

declare(strict_types=1);
?>
<div class="section-head"><div><p class="eyebrow">Accountability</p><h1>Audit log</h1></div></div>
<section class="card">
  <?php if ($events === []): ?><p class="muted">No recorded events.</p><?php else: ?>
  <div class="table-wrap"><table>
    <thead><tr><th>When</th><th>Actor</th><th>On behalf of</th><th>Action</th><th>Resource</th><th>Reason</th></tr></thead>
    <tbody><?php foreach ($events as $ev): ?>
      <tr>
        <td><?= e(wayfairs_datetime((string) $ev['created_at'])) ?></td>
        <td><?= e((string) ($ev['actor_email'] ?? 'system')) ?></td>
        <td><?= e((string) ($ev['effective_email'] ?? '—')) ?></td>
        <td><code><?= e((string) $ev['action']) ?></code></td>
        <td><?= e((string) $ev['resource_type']) ?> <span class="hint"><?= e((string) ($ev['resource_id'] ?? '')) ?></span></td>
        <td><?= e((string) ($ev['reason'] ?? '')) ?></td>
      </tr>
    <?php endforeach; ?></tbody>
  </table></div>
  <?php endif; ?>
</section>
