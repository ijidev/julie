<?php

declare(strict_types=1);
?>
<div class="section-head">
  <div>
    <p class="eyebrow">Customers</p>
    <h1>Customers</h1>
    <p>Registered customers, verification status, and account access.</p>
  </div>
</div>
<section class="card">
  <?php if ($users === []): ?>
    <div class="empty-state">
      <div class="empty-icon"><?= wayfairs_icon('customers') ?></div>
      <h3>No customers yet</h3>
      <p>Registered customers will appear here once they sign up.</p>
    </div>
  <?php else: ?>
    <div class="table-wrap"><table>
      <thead><tr><th>Name</th><th>Email</th><th>Account</th><th>Verification</th><th>Joined</th><th></th></tr></thead>
      <tbody><?php foreach ($users as $u): ?>
        <tr>
          <td><strong><?= e(trim($u['first_name'] . ' ' . $u['last_name'])) ?></strong></td>
          <td><?= e((string) $u['email']) ?></td>
          <td><?= wayfairs_pill((string) $u['status']) ?></td>
          <td><?= wayfairs_pill('kyc ' . (string) ($u['kyc_status'] ?? 'not_started')) ?></td>
          <td><?= e(wayfairs_datetime((string) $u['created_at'])) ?></td>
          <td><a class="btn small ghost" href="<?= e(wayfairs_url('/admin/users/' . $u['id'])) ?>">Open <?= wayfairs_icon('arrow-right', 'btn-icon') ?></a></td>
        </tr>
      <?php endforeach; ?></tbody>
    </table></div>
  <?php endif; ?>
</section>
