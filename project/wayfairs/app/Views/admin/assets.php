<?php

declare(strict_types=1);
?>
<div class="section-head">
  <div>
    <p class="eyebrow">Currencies &amp; settlement</p>
    <h1>Currencies</h1>
    <p>Enable or disable currencies, set fees and limits, and publish the deposit destination details customers see.</p>
  </div>
</div>

<section class="card">
  <h2>Add a currency</h2>
  <form class="stack" method="post" action="<?= e(wayfairs_url('/admin/assets')) ?>">
    <input type="hidden" name="_token" value="<?= e(wayfairs_csrf()) ?>" />
    <div class="row">
      <label>Code<input name="code" required maxlength="16" placeholder="EUR" style="text-transform:uppercase" /></label>
      <label>Name<input name="name" required maxlength="100" placeholder="Euro" /></label>
    </div>
    <div class="row">
      <label>Type
        <select name="asset_type" required>
          <option value="fiat">Fiat</option>
          <option value="crypto">Crypto</option>
        </select>
      </label>
      <label>Symbol<input name="symbol" required maxlength="16" placeholder="€" /></label>
      <label>Scale (decimals)<input type="number" name="scale" min="0" max="18" value="2" required /></label>
    </div>
    <button class="btn small" type="submit">Add currency</button>
  </form>
</section>

<?php foreach ($assets as $asset): ?>
  <section class="card" style="display:grid;gap:1rem">
    <div class="section-head" style="margin-bottom:0">
      <div style="display:flex;align-items:center;gap:.75rem;flex-wrap:wrap">
        <span class="mark" style="width:40px;height:40px;border-radius:12px;font-size:.95rem"><?= e(mb_substr($asset['code'], 0, 2)) ?></span>
        <div>
          <h2 style="margin:0"><?= e($asset['name']) ?> <span class="muted" style="font-weight:500">(<?= e($asset['code']) ?>)</span></h2>
          <p class="hint" style="margin:0"><?= e(ucfirst((string) $asset['asset_type'])) ?> · scale <?= (int) $asset['scale'] ?> · <?= wayfairs_pill($asset['enabled'] ? 'active' : 'closed') ?></p>
        </div>
      </div>
      <form method="post" action="<?= e(wayfairs_url('/admin/assets/' . $asset['code'] . '/delete')) ?>" style="margin:0">
        <input type="hidden" name="_token" value="<?= e(wayfairs_csrf()) ?>" />
        <button class="btn small danger" type="submit" onclick="return confirm('Remove this currency? Only possible if no customer accounts exist.')">Remove</button>
      </form>
    </div>
    <form class="stack" method="post" action="<?= e(wayfairs_url('/admin/assets/' . $asset['code'] . '/update')) ?>">
      <input type="hidden" name="_token" value="<?= e(wayfairs_csrf()) ?>" />
      <div class="row">
        <label>Name<input name="name" value="<?= e((string) $asset['name']) ?>" required /></label>
        <label>Enabled
          <select name="enabled">
            <option value="1" <?= $asset['enabled'] ? 'selected' : '' ?>>Enabled</option>
            <option value="0" <?= !$asset['enabled'] ? 'selected' : '' ?>>Disabled</option>
          </select>
        </label>
        <label>Deposits
          <select name="deposit_enabled">
            <option value="1" <?= $asset['deposit_enabled'] ? 'selected' : '' ?>>Open</option>
            <option value="0" <?= !$asset['deposit_enabled'] ? 'selected' : '' ?>>Closed</option>
          </select>
        </label>
        <label>Withdrawals
          <select name="withdrawal_enabled">
            <option value="1" <?= $asset['withdrawal_enabled'] ? 'selected' : '' ?>>Open</option>
            <option value="0" <?= !$asset['withdrawal_enabled'] ? 'selected' : '' ?>>Closed</option>
          </select>
        </label>
      </div>
      <div class="row">
        <label>Min deposit (<?= e((string) $asset['code']) ?>)<input name="min_deposit" inputmode="decimal" value="<?= e(wayfairs_major((int) $asset['min_deposit_minor'], (int) $asset['scale'])) ?>" /></label>
        <label>Min withdrawal (<?= e((string) $asset['code']) ?>)<input name="min_withdrawal" inputmode="decimal" value="<?= e(wayfairs_major((int) $asset['min_withdrawal_minor'], (int) $asset['scale'])) ?>" /></label>
        <label>Withdrawal fee (<?= e((string) $asset['code']) ?>)<input name="withdrawal_fee" inputmode="decimal" value="<?= e(wayfairs_major((int) $asset['withdrawal_fee_minor'], (int) $asset['scale'])) ?>" /></label>
        <label>Transfer fee (<?= e((string) $asset['code']) ?>)<input name="transfer_fee" inputmode="decimal" value="<?= e(wayfairs_major((int) $asset['transfer_fee_minor'], (int) $asset['scale'])) ?>" /></label>
      </div>
      <p class="field-hint">Amounts are entered in <?= e((string) $asset['code']) ?> units with up to <?= (int) $asset['scale'] ?> decimal places — not minor units.</p>

      <?php
      $missingDestination = false;
      if ((int) $asset['deposit_enabled'] === 1) {
          $missingDestination = $asset['asset_type'] === 'fiat'
              ? empty($asset['deposit_bank_name']) || empty($asset['deposit_account_number'])
              : empty($asset['deposit_wallet_address']) || empty($asset['deposit_network']);
      }
      ?>
      <?php if ($missingDestination): ?>
        <div class="notice warn" style="margin:0">
          <?= wayfairs_icon('support') ?>
          <div>
            <strong>Deposits are open but no destination is published</strong>
            <p>Customers will see an empty-destination warning instead of payment details. Add the required <?= $asset['asset_type'] === 'fiat' ? 'bank account' : 'wallet address and network' ?> below.</p>
          </div>
        </div>
      <?php endif; ?>

      <?php if ($asset['asset_type'] === 'fiat'): ?>
        <fieldset class="stack" style="border:1.5px solid var(--line);border-radius:14px;padding:1.1rem">
          <legend class="hint" style="padding:0 .5rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;font-size:.72rem">Fiat deposit destination</legend>
          <div class="row">
            <label>Bank name<input name="deposit_bank_name" value="<?= e((string) ($asset['deposit_bank_name'] ?? '')) ?>" /></label>
            <label>Account name<input name="deposit_account_name" value="<?= e((string) ($asset['deposit_account_name'] ?? '')) ?>" /></label>
          </div>
          <div class="row">
            <label>Account number<input name="deposit_account_number" value="<?= e((string) ($asset['deposit_account_number'] ?? '')) ?>" /></label>
            <label>Routing / sort code<input name="deposit_routing" value="<?= e((string) ($asset['deposit_routing'] ?? '')) ?>" /></label>
            <label>SWIFT / BIC<input name="deposit_swift" value="<?= e((string) ($asset['deposit_swift'] ?? '')) ?>" /></label>
          </div>
          <label>Customer instructions<textarea name="deposit_instructions" rows="2" placeholder="e.g. Use your registered email as the transfer reference."><?= e((string) ($asset['deposit_instructions'] ?? '')) ?></textarea></label>
        </fieldset>
      <?php else: ?>
        <fieldset class="stack" style="border:1.5px solid var(--line);border-radius:14px;padding:1.1rem">
          <legend class="hint" style="padding:0 .5rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;font-size:.72rem">Crypto deposit destination</legend>
          <div class="row">
            <label>Network<input name="deposit_network" value="<?= e((string) ($asset['deposit_network'] ?? '')) ?>" placeholder="e.g. Bitcoin, Ethereum (ERC-20)" /></label>
            <label>Wallet address<input name="deposit_wallet_address" value="<?= e((string) ($asset['deposit_wallet_address'] ?? '')) ?>" placeholder="bc1... or 0x..." /></label>
          </div>
          <label>Memo / tag (if required)<input name="deposit_memo" value="<?= e((string) ($asset['deposit_memo'] ?? '')) ?>" /></label>
          <label>Customer instructions<textarea name="deposit_instructions" rows="2" placeholder="e.g. Send only on the network shown. Deposits are reviewed after the required confirmations."><?= e((string) ($asset['deposit_instructions'] ?? '')) ?></textarea></label>
        </fieldset>
      <?php endif; ?>

      <button class="btn small" type="submit">Save <?= e($asset['code']) ?> settings</button>
    </form>
  </section>
<?php endforeach; ?>
