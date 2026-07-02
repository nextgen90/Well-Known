/* ============================================
   WatchPay Admin Panel — JavaScript
   ============================================ */

(function () {
  'use strict';

  // --- Initialize Lucide Icons ---
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }

  // ============================================
  // CONFIRM DIALOGS
  // ============================================

  // Confirm delete actions
  document.querySelectorAll('.confirm-delete').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
        e.preventDefault();
      }
    });
  });

  // Confirm approve actions
  document.querySelectorAll('.confirm-approve').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      if (!confirm('Are you sure you want to approve this request?')) {
        e.preventDefault();
      }
    });
  });

  // Confirm reject actions
  document.querySelectorAll('.confirm-reject').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      if (!confirm('Are you sure you want to reject this request?')) {
        e.preventDefault();
      }
    });
  });

  // ============================================
  // USER SEARCH FUNCTIONALITY
  // ============================================

  var userSearch = document.getElementById('userSearch');
  var usersTable = document.getElementById('usersTable');

  if (userSearch && usersTable) {
    userSearch.addEventListener('input', function () {
      var query = this.value.toLowerCase().trim();
      var rows = usersTable.querySelectorAll('tbody tr');

      rows.forEach(function (row) {
        var name = (row.cells[1] && row.cells[1].textContent || '').toLowerCase();
        var mobile = (row.cells[2] && row.cells[2].textContent || '').toLowerCase();

        if (name.indexOf(query) !== -1 || mobile.indexOf(query) !== -1) {
          row.style.display = '';
        } else {
          row.style.display = 'none';
        }
      });
    });
  }

  // ============================================
  // AUTO-DISMISS TOAST MESSAGES
  // ============================================

  document.querySelectorAll('[data-auto-dismiss]').forEach(function (toast) {
    setTimeout(function () {
      toast.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      setTimeout(function () {
        toast.remove();
      }, 400);
    }, 4000);
  });

  // ============================================
  // SIDEBAR ACTIVE LINK HIGHLIGHTING
  // ============================================

  var currentPath = window.location.pathname;
  document.querySelectorAll('.sidebar-nav a').forEach(function (link) {
    var href = link.getAttribute('href');
    // Remove existing active class first
    link.classList.remove('active');
    // Check if current path starts with the link's href
    if (href && currentPath.startsWith(href)) {
      link.classList.add('active');
    }
  });

  // ============================================
  // SIDEBAR MOBILE TOGGLE
  // ============================================

  var sidebarToggle = document.getElementById('sidebarToggle');
  var adminSidebar = document.getElementById('adminSidebar');
  var sidebarOverlay = document.getElementById('sidebarOverlay');

  if (sidebarToggle && adminSidebar) {
    sidebarToggle.addEventListener('click', function () {
      adminSidebar.classList.toggle('open');
      if (sidebarOverlay) {
        sidebarOverlay.classList.toggle('active');
      }
    });

    if (sidebarOverlay) {
      sidebarOverlay.addEventListener('click', function () {
        adminSidebar.classList.remove('open');
        sidebarOverlay.classList.remove('active');
      });
    }
  }

  // ============================================
  // MODAL FUNCTIONALITY
  // ============================================

  // Close modal on overlay click
  document.querySelectorAll('.modal-overlay').forEach(function (overlay) {
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) {
        overlay.classList.remove('active');
      }
    });
  });

  // Close modal on Escape key
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.active').forEach(function (overlay) {
        overlay.classList.remove('active');
      });
    }
  });

  // ============================================
  // FILTER FORM AUTO-SUBMIT (for select dropdowns)
  // ============================================

  document.querySelectorAll('.filter-row select').forEach(function (select) {
    select.addEventListener('change', function () {
      var form = this.closest('form');
      if (form) form.submit();
    });
  });

  // ============================================
  // AUTO-REFRESH DASHBOARD STATS (every 60s)
  // ============================================

  if (window.location.pathname.includes('/admin/dashboard')) {
    setInterval(function () {
      // Soft reload: only if user is on dashboard
      if (document.visibilityState === 'visible') {
        window.location.reload();
      }
    }, 60000); // 60 seconds
  }

})();
