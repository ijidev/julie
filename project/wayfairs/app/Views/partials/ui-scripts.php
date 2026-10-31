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
})();
</script>
