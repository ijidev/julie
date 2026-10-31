<?php

declare(strict_types=1);

$site = wayfairs_public_settings();
$kycStatus = (string) ($kyc['status'] ?? 'not_started');
$depositAccounts = array_values(array_filter(
    $accounts,
    static fn (array $account): bool => (int) ($account['asset']['deposit_enabled'] ?? 0) === 1
));
$firstAsset = $depositAccounts[0]['asset'] ?? null;
?>
<div class="section-head">
  <div>
    <p class="eyebrow">Money in</p>
    <h1>Deposit</h1>
    <p>Choose a currency, send using the published destination, then submit the reference so an administrator can verify receipt.</p>
  </div>
  <?= wayfairs_pill('kyc ' . $kycStatus) ?>
</div>

<?php if ($kycStatus !== 'verified'): ?>
  <div class="notice warn">
    <?= wayfairs_icon('verification') ?>
    <div>
      <strong>Verification must be approved before deposits can be credited</strong>
      <p>You can review the deposit destinations below, but a request cannot be accepted until an administrator approves your identity verification.</p>
      <p style="margin-top:.55rem"><a class="btn small" href="<?= e(wayfairs_url('/kyc')) ?>">Go to verification</a></p>
    </div>
  </div>
<?php endif; ?>

<?php if ($depositAccounts === []): ?>
  <div class="notice warn">
    <?= wayfairs_icon('deposit') ?>
    <div>
      <strong>Deposits are not open right now</strong>
      <p>No enabled currency currently accepts deposits. Contact support if you were expecting to deposit.</p>
    </div>
  </div>
<?php else: ?>
  <section class="grid two">
    <article class="card">
      <h2>Request a deposit</h2>
      <p class="hint">Your balance changes only after an administrator verifies the incoming funds.</p>
      <form class="stack" method="post" action="<?= e(wayfairs_url('/deposit')) ?>" id="deposit-form" style="margin-top:.9rem">
        <input type="hidden" name="_token" value="<?= e(wayfairs_csrf()) ?>" />
        <input type="hidden" name="idem" value="<?= e(wayfairs_idem()) ?>" />
        <label>Currency or asset
          <select name="asset_code" id="deposit-asset" required>
            <?php foreach ($depositAccounts as $account): $optionAsset = $account['asset']; ?>
              <option value="<?= e((string) $optionAsset['code']) ?>" data-type="<?= e((string) $optionAsset['asset_type']) ?>">
                <?= e((string) $optionAsset['name']) ?> (<?= e((string) $optionAsset['code']) ?>)
              </option>
            <?php endforeach; ?>
          </select>
        </label>
        <label>Amount
          <input name="amount" inputmode="decimal" placeholder="<?= e($firstAsset ? 'Minimum ' . wayfairs_amount((int) $firstAsset['min_deposit_minor'], (int) $firstAsset['scale'], (string) $firstAsset['symbol']) : '0.00') ?>" required />
          <span class="field-hint">Enter the exact amount you sent. Anything below the published minimum is rejected.</span>
        </label>
        <label>Your transfer reference or transaction hash
          <input name="sender_reference" maxlength="200" placeholder="Bank reference or blockchain transaction hash" />
          <span class="field-hint">This is the reference the administrator will match against the received funds.</span>
        </label>
        <button class="btn full" type="submit">Submit deposit request <?= wayfairs_icon('arrow-right', 'btn-icon') ?></button>
      </form>
    </article>

    <article class="card" id="deposit-destination">
      <div class="section-head" style="margin-bottom:0">
        <div><h2>Where to send funds</h2><p>These details update when you choose a different currency.</p></div>
      </div>

      <?php foreach ($depositAccounts as $index => $account): $destinationAsset = $account['asset']; ?>
        <div class="deposit-dest" data-asset="<?= e((string) $destinationAsset['code']) ?>"<?= $index === 0 ? '' : ' hidden' ?>>
          <div style="display:flex;justify-content:space-between;align-items:center;gap:.5rem;flex-wrap:wrap">
            <h3><?= e((string) $destinationAsset['name']) ?> <span class="muted">(<?= e((string) $destinationAsset['code']) ?>)</span></h3>
            <?= wayfairs_pill($destinationAsset['asset_type'] === 'crypto' ? 'crypto' : 'fiat') ?>
          </div>

          <?php if ($destinationAsset['asset_type'] === 'fiat'): ?>
            <?php if (!empty($destinationAsset['deposit_bank_name']) || !empty($destinationAsset['deposit_account_number'])): ?>
              <dl class="kv">
                <?php if (!empty($destinationAsset['deposit_bank_name'])): ?><dt>Bank</dt><dd><?= e((string) $destinationAsset['deposit_bank_name']) ?></dd><?php endif; ?>
                <?php if (!empty($destinationAsset['deposit_account_name'])): ?><dt>Account name</dt><dd><?= e((string) $destinationAsset['deposit_account_name']) ?></dd><?php endif; ?>
                <?php if (!empty($destinationAsset['deposit_account_number'])): ?>
                  <dt>Account number</dt>
                  <dd><code class="mono"><?= e((string) $destinationAsset['deposit_account_number']) ?></code> <button class="btn small ghost" type="button" data-copy="<?= e((string) $destinationAsset['deposit_account_number']) ?>">Copy</button></dd>
                <?php endif; ?>
                <?php if (!empty($destinationAsset['deposit_routing'])): ?><dt>Routing / sort code</dt><dd><?= e((string) $destinationAsset['deposit_routing']) ?></dd><?php endif; ?>
                <?php if (!empty($destinationAsset['deposit_swift'])): ?><dt>SWIFT / BIC</dt><dd><?= e((string) $destinationAsset['deposit_swift']) ?></dd><?php endif; ?>
              </dl>
            <?php else: ?>
              <div class="deposit-empty"><?= wayfairs_icon('support') ?><span>No bank details have been published for <?= e((string) $destinationAsset['code']) ?> yet. Contact support before sending funds.</span></div>
            <?php endif; ?>
          <?php else: ?>
            <?php if (!empty($destinationAsset['deposit_wallet_address'])): ?>
              <dl class="kv">
                <?php if (!empty($destinationAsset['deposit_network'])): ?><dt>Network</dt><dd><?= e((string) $destinationAsset['deposit_network']) ?></dd><?php endif; ?>
                <dt>Wallet address</dt>
                <dd>
                  <code class="mono wrap-anywhere"><?= e((string) $destinationAsset['deposit_wallet_address']) ?></code>
                  <button class="btn small ghost" type="button" data-copy="<?= e((string) $destinationAsset['deposit_wallet_address']) ?>">Copy</button>
                </dd>
                <?php if (!empty($destinationAsset['deposit_memo'])): ?><dt>Memo / tag</dt><dd><code class="mono"><?= e((string) $destinationAsset['deposit_memo']) ?></code></dd><?php endif; ?>
              </dl>
            <?php else: ?>
              <div class="deposit-empty"><?= wayfairs_icon('support') ?><span>No wallet address has been published for <?= e((string) $destinationAsset['code']) ?> yet. Contact support before sending funds.</span></div>
            <?php endif; ?>
          <?php endif; ?>

          <p class="field-hint"><strong>Minimum deposit:</strong> <?= e(wayfairs_amount((int) $destinationAsset['min_deposit_minor'], (int) $destinationAsset['scale'], (string) $destinationAsset['symbol'], (string) $destinationAsset['code'])) ?></p>
          <?php
          $fallback = $destinationAsset['asset_type'] === 'crypto'
              ? (string) ($site['site.deposit_instructions_crypto'] ?? '')
              : (string) ($site['site.deposit_instructions_fiat'] ?? '');
          $instructions = trim((string) ($destinationAsset['deposit_instructions'] ?? '')) ?: $fallback;
          ?>
          <?php if ($instructions !== ''): ?><p class="field-hint"><?= e($instructions) ?></p><?php endif; ?>
          <p class="field-hint">Send only the selected asset on the stated network. Deposits sent elsewhere cannot be recovered.</p>
        </div>
      <?php endforeach; ?>
    </article>
  </section>

  <script>
  (function () {
    var select = document.getElementById('deposit-asset');
    var blocks = document.querySelectorAll('.deposit-dest');
    if (!select) return;
    function showSelected() {
      var code = select.value;
      blocks.forEach(function (block) {
        block.hidden = block.getAttribute('data-asset') !== code;
      });
      var option = select.options[select.selectedIndex];
      var amount = document.querySelector('#deposit-form input[name="amount"]');
      if (amount && option) {
        var assetName = option.textContent.trim();
        amount.placeholder = 'Amount in ' + assetName;
      }
    }
    select.addEventListener('change', showSelected);
    showSelected();
  })();
  </script>
<?php endif; ?>

<section class="card">
  <div class="section-head">
    <div><h2>Your deposit requests</h2><p>Pending requests are reviewed against the received funds.</p></div>
  </div>
  <?php if ($deposits === []): ?>
    <div class="empty-state">
      <div class="empty-icon"><?= wayfairs_icon('deposit') ?></div>
      <h3>No deposit requests yet</h3>
      <p>Submitted deposits will appear here with their verification status and reference.</p>
    </div>
  <?php else: ?>
    <div class="table-wrap"><table>
      <thead><tr><th>Submitted</th><th>Asset</th><th>Amount</th><th>Reference</th><th>Status</th></tr></thead>
      <tbody><?php foreach ($deposits as $deposit): ?>
        <tr>
          <td><?= e(wayfairs_datetime((string) $deposit['created_at'])) ?></td>
          <td><strong><?= e((string) $deposit['asset_code']) ?></strong></td>
          <td><?= e(wayfairs_amount((int) $deposit['amount_minor'], (int) $deposit['asset_scale'], (string) $deposit['asset_symbol'])) ?></td>
          <td><?= e((string) ($deposit['sender_reference'] ?? '—')) ?></td>
          <td><?= wayfairs_pill((string) $deposit['status']) ?></td>
        </tr>
      <?php endforeach; ?></tbody>
    </table></div>
  <?php endif; ?>
</section>
