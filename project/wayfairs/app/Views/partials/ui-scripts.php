<?php

declare(strict_types=1);
?>
<script>
(function () {
  var menus = document.querySelectorAll('.guest-mobile-menu, .mobile-app-menu');

  function closeMenus(except) {
    menus.forEach(function (menu) {
      if (menu !== except) {
        menu.open = false;
      }
    });
  }

  menus.forEach(function (menu) {
    menu.addEventListener('toggle', function () {
      if (menu.open) {
        closeMenus(menu);
      }
    });
  });

  document.addEventListener('click', function (event) {
    menus.forEach(function (menu) {
      if (menu.open && !menu.contains(event.target)) {
        menu.open = false;
      }
    });
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      closeMenus(null);
    }
  });

  menus.forEach(function (menu) {
    menu.addEventListener('click', function (event) {
      if (event.target.closest('a, button')) {
        menu.open = false;
      }
    });
  });

  document.addEventListener('click', function (event) {
    var button = event.target.closest('[data-copy]');
    if (!button) {
      return;
    }
    var value = button.getAttribute('data-copy') || '';
    var original = button.getAttribute('data-label') || button.textContent;
    var done = function () {
      button.textContent = 'Copied';
      window.setTimeout(function () { button.textContent = original; }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(done).catch(function () {});
      return;
    }
    var field = document.createElement('textarea');
    field.value = value;
    document.body.appendChild(field);
    field.select();
    try { document.execCommand('copy'); done(); } catch (error) {}
    document.body.removeChild(field);
  });

  document.querySelectorAll('[data-filter-scope]').forEach(function (scope) {
    var input = scope.querySelector('[data-filter-input]');
    var selects = scope.querySelectorAll('[data-filter-key]');
    var rows = scope.querySelectorAll('[data-filter-row]');
    var empty = scope.querySelector('[data-filter-empty]');

    function applyFilters() {
      var query = input ? input.value.trim().toLowerCase() : '';
      var visible = 0;
      rows.forEach(function (row) {
        var textMatches = query === '' || row.textContent.toLowerCase().indexOf(query) !== -1;
        var facetsMatch = true;
        selects.forEach(function (select) {
          var value = select.value;
          var key = select.getAttribute('data-filter-key') || '';
          if (value !== '' && row.getAttribute('data-' + key) !== value) {
            facetsMatch = false;
          }
        });
        row.hidden = !(textMatches && facetsMatch);
        if (!row.hidden) visible++;
      });
      if (empty) empty.hidden = visible !== 0;
    }

    if (input) input.addEventListener('input', applyFilters);
    selects.forEach(function (select) { select.addEventListener('change', applyFilters); });
  });
})();
</script>
