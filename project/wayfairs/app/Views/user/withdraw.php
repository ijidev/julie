<?php

declare(strict_types=1);

$site = wayfairs_public_settings();
$notice = trim((string) ($site['site.withdrawal_notice'] ?? ''));
$withdrawalAccounts = array_values(array_filter(
    $accounts,
    static fn (array $account): bool => (int) ($account['asset']['withdrawal_enabled'] ?? 0) === 1
));
$firstAccount = $withdrawalAccounts[0] ?? null;
$firstAsset = $firstAccount['asset'] ?? null;
$firstType = (string) ($firstAsset['asset_type'] ?? 'fiat');
?>
<div class="section-head">
  <div>
    <p class="eyebrow">Money out</p>
    <h1>Withdraw</h1>
    <p>Request a payout to your bank account or wallet. Funds are reserved immediately and released when an administrator completes or rejects the request.</p>
  </div>
  <?php if ($firstAccount): ?>
    <div class="section-actions">
      <span class="pill">Available <?= e(wayfairs_amount((int) $firstAccount['available_minor'], (int) $firstAsset['scale'], (string) $firstAsset['symbol'], (string) $firstAsset['code'])) ?></span>
    </div>
  <?php endif; ?>
</div>

<?php if ($notice !== ''): ?>
  <div class="notice brand">
    <?= wayfairs_icon('withdraw') ?>
    <div><strong>Before you request</strong><p><?= e($notice) ?></p></div>
  </div>
<?php endif; ?>

<?php if ($withdrawalAccounts === []): ?>
  <div class="notice warn">
    <?= wayfairs_icon('withdraw') ?>
    <div>
      <strong>Withdrawals are not open right now</strong>
      <p>No enabled currency currently accepts withdrawals. Contact support if you were expecting to withdraw.</p>
    </div>
  </div>
<?php else: ?>
  <section class="grid two">
    <article class="card">
      <h2>Request a withdrawal</h2>
      <p class="hint">The requested amount plus any withdrawal fee is reserved from your available balance as soon as you submit.</p>
      <form class="stack" method="post" action="<?= e(wayfairs_url('/withdraw')) ?>" id="withdraw-form" style="margin-top:.9rem">
        <input type="hidden" name="_token" value="<?= e(wayfairs_csrf()) ?>" />
        <input type="hidden" name="idem" value="<?= e(wayfairs_idem()) ?>" />
        <label>Currency or asset
          <select name="asset_code" id="withdraw-asset" required>
            <?php foreach ($withdrawalAccounts as $account): $optionAsset = $account['asset']; ?>
              <option
                value="<?= e((string) $optionAsset['code']) ?>"
                data-type="<?= e((string) $optionAsset['asset_type']) ?>"
                data-min="<?= e(wayfairs_amount((int) $optionAsset['min_withdrawal_minor'], (int) $optionAsset['scale'], (string) $optionAsset['symbol'], (string) $optionAsset['code'])) ?>"
                data-fee="<?= e(wayfairs_amount((int) $optionAsset['withdrawal_fee_minor'], (int) $optionAsset['scale'], (string) $optionAsset['symbol'], (string) $optionAsset['code'])) ?>"
                data-available="<?= e(wayfairs_amount((int) $account['available_minor'], (int) $optionAsset['scale'], (string) $optionAsset['symbol'], (string) $optionAsset['code'])) ?>">
                <?= e((string) $optionAsset['name']) ?> (<?= e((string) $optionAsset['code']) ?>)
              </option>
            <?php endforeach; ?>
          </select>
        </label>
        <label>Amount
          <input name="amount" inputmode="decimal" placeholder="0.00" required />
          <span class="field-hint" id="withdraw-amount-hint"></span>
        </label>

        <fieldset class="stack destination-group" data-type="fiat" style="border:1.5px solid var(--line);border-radius:14px;padding:1.1rem"<?= $firstType === 'fiat' ? '' : ' hidden' ?>>
          <legend class="hint" style="padding:0 .5rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;font-size:.72rem">Bank destination</legend>
          <label>Bank name<input name="bank_name" maxlength="120" autocomplete="organization"<?= $firstType === 'fiat' ? ' required' : '' ?> /></label>
          <label>Account name<input name="account_name" maxlength="120" autocomplete="name" /></label>
          <label>Account number<input name="account_number" maxlength="40" inputmode="numeric"<?= $firstType === 'fiat' ? ' required' : '' ?> /></label>
          <div class="row">
            <label>Routing / sort code<input name="routing" maxlength="40" /></label>
            <label>SWIFT / BIC<input name="swift" maxlength="40" /></label>
          </div>
        </fieldset>

        <fieldset class="stack destination-group" data-type="crypto" style="border:1.5px solid var(--line);border-radius:14px;padding:1.1rem"<?= $firstType === 'crypto' ? '' : ' hidden' ?>>
          <legend class="hint" style="padding:0 .5rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;font-size:.72rem">Wallet destination</legend>
          <label>Network<input name="network" maxlength="60" placeholder="e.g. Bitcoin, Ethereum (ERC-20)"<?= $firstType === 'crypto' ? ' required' : '' ?> /></label>
          <label>Wallet address<input name="address" maxlength="200" placeholder="bc1... or 0x..."<?= $firstType === 'crypto' ? ' required' : '' ?> /></label>
          <label>Memo / tag (if required)<input name="memo" maxlength="120" /></label>
        </fieldset>

        <button class="btn full" type="submit">Submit withdrawal request <?= wayfairs_icon('arrow-right', 'btn-icon') ?></button>
      </form>
    </article>

    <article class="card">
      <div class="section-head" style="margin-bottom:.75rem">
        <div><h2>Available to withdraw</h2><p>Available excludes amounts already reserved for pending withdrawals.</p></div>
      </div>
      <div class="account-list">
        <?php foreach ($withdrawalAccounts as $account): $rowAsset = $account['asset']; ?>
          <div class="account-row" style="cursor:default">
            <span class="account-code"><?= e((string) $rowAsset['code']) ?></span>
            <span class="account-main">
              <strong><?= e((string) $rowAsset['name']) ?></strong>
              <span>Minimum <?= e(wayfairs_amount((int) $rowAsset['min_withdrawal_minor'], (int) $rowAsset['scale'], (string) $rowAsset['symbol'])) ?> · Fee <?= (int) $rowAsset['withdrawal_fee_minor'] > 0 ? e(wayfairs_amount((int) $rowAsset['withdrawal_fee_minor'], (int) $rowAsset['scale'], (string) $rowAsset['symbol'])) : 'none' ?></span>
            </span>
            <span class="account-tail"><?= e(wayfairs_amount((int) $account['available_minor'], (int) $rowAsset['scale'], (string) $rowAsset['symbol'], (string) $rowAsset['code'])) ?></span>
          </div>
        <?php endforeach; ?>
      </div>

      <h3 style="margin-top:1.25rem">How a withdrawal is completed</h3>
      <ol class="stack tight" style="margin:.5rem 0 0;padding-left:1.2rem;color:var(--muted);font-size:.9rem">
        <li>You submit the amount and destination. The amount plus fee is reserved.</li>
        <li>An administrator verifies and completes the payout with the external provider.</li>
        <li>The reservation is captured and the transaction is marked completed with a receipt.</li>
      </ol>
    </article>
  </section>

  <script>
  (function () {
    var select = document.getElementById('withdraw-asset');
    var form = document.getElementById('withdraw-form');
    var groups = document.querySelectorAll('.destination-group');
    var hint = document.getElementById('withdraw-amount-hint');
    if (!select || !form) return;

    function sync() {
      var option = select.options[select.selectedIndex];
      var type = option ? option.getAttribute('data-type') : 'fiat';
      groups.forEach(function (group) {
        var matches = group.getAttribute('data-type') === type;
        group.hidden = !matches;
        group.querySelectorAll('input').forEach(function (input) {
          input.disabled = !matches;
          input.required = matches && matchesRequired(type, input.name);
        });
      });
      if (hint && option) {
        hint.textContent = 'Minimum ' + option.getAttribute('data-min') + ' · Fee ' + option.getAttribute('data-fee') + ' · Available ' + option.getAttribute('data-available');
      }
    }

    function matchesRequired(type, name) {
      if (type === 'crypto') return name === 'network' || name === 'address';
      return name === 'bank_name' || name === 'account_number';
    }

    select.addEventListener('change', sync);
    sync();
  })();
  </script>
<?php endif; ?>

<section class="card">
  <div class="section-head">
    <div><h2>Your withdrawals</h2><p>Requests stay reserved until they are completed or rejected.</p></div>
  </div>
  <?php if ($withdrawals === []): ?>
    <div class="empty-state">
      <div class="empty-icon"><?= wayfairs_icon('withdraw') ?></div>
      <h3>No withdrawals yet</h3>
      <p>When you request a payout it will appear here with its reserved amount and status.</p>
    </div>
  <?php else: ?>
    <div class="table-wrap"><table>
      <thead><tr><th>Submitted</th><th>Asset</th><th>Amount</th><th>Fee</th><th>Destination</th><th>Status</th></tr></thead>
      <tbody><?php foreach ($withdrawals as $w): ?>
        <tr>
          <td><?= e(wayfairs_datetime((string) $w['created_at'])) ?></td>
          <td><strong><?= e((string) $w['asset_code']) ?></strong></td>
          <td><?= e(wayfairs_amount((int) $w['amount_minor'], (int) $w['asset_scale'], (string) $w['asset_symbol'])) ?></td>
          <td><?= (int) $w['fee_minor'] > 0 ? e(wayfairs_amount((int) $w['fee_minor'], (int) $w['asset_scale'], (string) $w['asset_symbol'])) : '—' ?></td>
          <td><?= e((string) ($w['destination_summary'] ?? '—')) ?></td>
          <td><?= wayfairs_pill((string) $w['status']) ?></td>
        </tr>
      <?php endforeach; ?></tbody>
    </table></div>
  <?php endif; ?>
</section>
