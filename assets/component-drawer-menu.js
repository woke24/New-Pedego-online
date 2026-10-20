class DrawerMenu extends HTMLElement {
  constructor() {
    'use strict';
    super();

    this.el = this;
    this.mainLevel = this.el.querySelector('[data-contents]');
    this.init();
  }

  init() {
    this.submenuTriggers = this.el.querySelectorAll('[data-drawer-submenu-trigger]');
    this.submenuTriggers.forEach((trigger) => {
      trigger.addEventListener('click', this.onSubmenuTriggerClick.bind(this));
    });

    this.closeButtons = this.el.querySelectorAll('[data-close]');
    this.closeButtons.forEach((btn) => {
      btn.addEventListener('click', () => this.resetSubmenus());
    });

    this.overlay = this.el.querySelector('[data-overlay]');
    this.overlay.addEventListener('click', () => this.resetSubmenus());

    this.secondLevelBackButtons = this.el.querySelectorAll('[data-drawer-submenu-close]');
    this.secondLevelBackButtons.forEach((button) => {
      button.addEventListener('click', this.onSubmenuBackClick.bind(this));
    });

    this.subitemOpeners = document.querySelectorAll('[data-drawer-submenu-open]');
    this.subitemOpeners.forEach((button) => {
      button.addEventListener('click', this.toggleMenuItemFromTheme.bind(this));
    });
  }

  resetSubmenus() {
    this.closeAllSubmenusExcept(null);
  }

  closeAllSubmenusExcept(skipAccordion) {
    this.mainLevel.querySelectorAll('[data-accordion-item].is-open').forEach((accordion) => {
      if (skipAccordion && accordion === skipAccordion) {
        return;
      }
      accordion.classList.remove('is-open');
      const trigger = accordion.querySelector('[data-drawer-submenu-trigger]');
      if (trigger) {
        trigger.setAttribute('aria-expanded', 'false');
      }
    });

    if (!skipAccordion) {
      this.mainLevel.classList.remove('has-open-submenu');
    }
  }

  setSubmenuOpen(accordion, open) {
    if (!accordion) return;

    const trigger = accordion.querySelector('[data-drawer-submenu-trigger]');
    if (open) {
      accordion.classList.add('is-open');
      this.mainLevel.classList.add('has-open-submenu');
      if (trigger) {
        trigger.setAttribute('aria-expanded', 'true');
      }
    } else {
      accordion.classList.remove('is-open');
      if (trigger) {
        trigger.setAttribute('aria-expanded', 'false');
      }
      if (!this.mainLevel.querySelector('[data-accordion-item].is-open')) {
        this.mainLevel.classList.remove('has-open-submenu');
      }
    }
  }

  openSubmenu(accordion) {
    if (!accordion) return;

    const isOpen = accordion.classList.contains('is-open');
    if (isOpen) {
      this.setSubmenuOpen(accordion, false);
      return;
    }

    this.closeAllSubmenusExcept(accordion);
    this.setSubmenuOpen(accordion, true);
  }

  ensureSubmenuOpen(accordion) {
    if (!accordion || accordion.classList.contains('is-open')) return;

    this.closeAllSubmenusExcept(accordion);
    this.setSubmenuOpen(accordion, true);
  }

  onSubmenuTriggerClick(event) {
    const trigger = event.currentTarget;
    const accordion = trigger.closest('[data-accordion-item]');
    this.openSubmenu(accordion);
  }

  toggleMenuItemFromTheme(scope) {
    const button = scope.currentTarget || scope;
    const submenuId = button.getAttribute('data-drawer-submenu-open');
    if (!submenuId) return;

    const accordion = this.el.querySelector(
      `[data-accordion-item][data-submenu-id="${submenuId}"]`
    );
    if (!accordion) return;

    Woolman.ModalsAndDrawers.showModalOrDrawer(this.el.getAttribute('id'));

    const animationFinished = () => {
      this.el.removeEventListener('transitionend', animationFinished);
      this.ensureSubmenuOpen(accordion);
    };
    this.el.addEventListener('transitionend', animationFinished);
  }

  onSubmenuBackClick(event) {
    this.resetSubmenus();

    const button = event.currentTarget;
    const accordionId = button.getAttribute('data-drawer-submenu-close');
    if (!accordionId) return;

    const panel = document.getElementById(accordionId + '-container');
    const accordion = panel?.closest('[data-accordion-item]');
    const trigger = accordion?.querySelector('[data-drawer-submenu-trigger]');
    if (trigger) {
      trigger.focus();
    }
  }
}

if (customElements.get('drawer-menu') === undefined) {
  customElements.define('drawer-menu', DrawerMenu);
}
