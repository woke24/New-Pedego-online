(function () {
  'use strict';

  const DEBUG = true;
  const log = (...args) => {
    if (DEBUG) console.log('[theme-editor]', ...args);
  };

  const MOBILE_MQ = window.matchMedia('(max-width: 767px)');
  const DESKTOP_NAV_MQ = window.matchMedia('(min-width: 1024px)');

  let activeBlockId = null;
  let activeSectionId = null;
  let activeGridy = { sectionId: null, blockId: null };
  let activeFaq = { sectionId: null, blockId: null };

  function getModalEl(sectionId) {
    return document.querySelector(`[data-modal][data-section-id="${sectionId}"]`);
  }

  function isModalSection(sectionId) {
    return String(sectionId).includes('modal');
  }

  function showModalForSection(sectionId) {
    const modal = getModalEl(sectionId);
    if (modal?.id) Woolman.ModalsAndDrawers.showModalOrDrawer(modal.id);
  }

  function closeModalForSection(sectionId) {
    const modal = getModalEl(sectionId);
    if (modal?.id) Woolman.ModalsAndDrawers.closeModalOrDrawer(modal.id);
  }

  function reinitHeaderIfNeeded(sectionDomId) {
    if (sectionDomId === Woolman.Header?.cache?.section?.id) {
      Woolman.ModalsAndDrawers.init();
      Woolman.Header.init();
    }
  }

  function getBlockData(el) {
    if (!el?.dataset?.shopifyEditorBlock) return null;
    try {
      return JSON.parse(el.dataset.shopifyEditorBlock);
    } catch {
      return null;
    }
  }

  function blockIdMatches(domBlockId, eventBlockId) {
    if (domBlockId == null || eventBlockId == null) return false;

    const domId = String(domBlockId);
    const eventId = String(eventBlockId);
    if (domId === eventId) return true;

    const domSuffix = domId.split('__').pop();
    const eventSuffix = eventId.split('__').pop();
    if (domSuffix && domSuffix === eventSuffix) return true;

    return domId.endsWith(eventId) || eventId.endsWith(domId);
  }

  function findBlockEl(sectionEl, blockId, evt) {
    const fromTarget = evt?.target?.closest?.('[data-shopify-editor-block]');
    if (fromTarget && blockIdMatches(getBlockData(fromTarget)?.id, blockId)) return fromTarget;

    return [...sectionEl.querySelectorAll('[data-shopify-editor-block]')]
      .find((el) => blockIdMatches(getBlockData(el)?.id, blockId)) || null;
  }

  function getGridySlider(sectionEl) {
    return sectionEl.querySelector('gridy-slider');
  }

  function isGridySliderActiveAtViewport(slider) {
    const w = window.innerWidth;
    if (w >= 1024) return slider.dataset.desktopEnabled === 'true';
    if (w >= 768) return slider.dataset.tabletEnabled === 'true';
    return slider.dataset.mobileEnabled === 'true';
  }

  function getTrackSlideEl(track, blockEl) {
    let el = blockEl;
    while (el && el.parentElement !== track) el = el.parentElement;
    return el?.parentElement === track ? el : null;
  }

  function getSlideIndex(track, slideEl) {
    return [...track.children].indexOf(slideEl);
  }

  function isFaqSection(sectionEl) {
    return !!sectionEl.querySelector('details.faq-item[data-shopify-editor-block]');
  }

  function isFaqQuestionBlock(blockEl) {
    return getBlockData(blockEl)?.type === 'question';
  }

  function openFaqItem(details) {
    details.open = true;
    details.style.height = '';
    details.style.overflow = '';
  }

  function closeFaqItem(details) {
    details.open = false;
    details.style.height = '';
    details.style.overflow = '';
  }

  function previewGridyBlock(sectionEl, sectionId, blockId, evt) {
    const slider = getGridySlider(sectionEl);
    if (!slider) return;

    const blockEl = findBlockEl(sectionEl, blockId, evt);
    if (!blockEl) return;

    const track = slider.querySelector('.gridy-track');
    if (!track) return;

    const slideEl = getTrackSlideEl(track, blockEl);
    if (!slideEl) return;

    activeGridy = { sectionId, blockId };

    if (isGridySliderActiveAtViewport(slider)) {
      slider.clearAutoplayTimer();
      const index = getSlideIndex(track, slideEl);
      slider.config.current_slide = index;
      slider.scrollToSlide(index);
      log('previewGridyBlock: scrolled to slide', { index, sectionId, blockId });
    } else {
      slideEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      log('previewGridyBlock: scrolled block into view (grid mode)', { sectionId, blockId });
    }
  }

  function resetGridySlider(sectionEl) {
    const slider = getGridySlider(sectionEl);
    if (!slider || !isGridySliderActiveAtViewport(slider)) return;

    slider.clearAutoplayTimer();
    slider.config.current_slide = 0;
    slider.scrollToSlide(0);
    if (slider.config.autoplay) slider.autoplayGridy();
    log('resetGridySlider');
  }

  function handleGridyBlockDeselect(sectionId, blockId) {
    if (activeGridy.sectionId !== sectionId || activeGridy.blockId !== blockId) return;

    const sectionEl = document.getElementById('shopify-section-' + sectionId);
    if (sectionEl) resetGridySlider(sectionEl);
    activeGridy = { sectionId: null, blockId: null };
  }

  function reopenActiveGridy() {
    if (!activeGridy.sectionId || !activeGridy.blockId) return;

    const sectionEl = document.getElementById('shopify-section-' + activeGridy.sectionId);
    if (!sectionEl) return;

    previewGridyBlock(sectionEl, activeGridy.sectionId, activeGridy.blockId, {});
    log('reopenActiveGridy');
  }

  function previewFaqBlock(sectionEl, sectionId, blockId, evt) {
    const blockEl = findBlockEl(sectionEl, blockId, evt);
    if (!blockEl) return;

    if (isFaqQuestionBlock(blockEl)) {
      const details = blockEl.tagName === 'DETAILS' ? blockEl : blockEl.closest('details.faq-item');
      if (!details) return;
      openFaqItem(details);
      activeFaq = { sectionId, blockId };
      log('previewFaqBlock: opened question', { sectionId, blockId });
    } else {
      blockEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      log('previewFaqBlock: scrolled block into view', { sectionId, blockId });
    }
  }

  function handleFaqBlockDeselect(sectionId, blockId) {
    if (activeFaq.sectionId !== sectionId || activeFaq.blockId !== blockId) return;

    const sectionEl = document.getElementById('shopify-section-' + sectionId);
    const blockEl = sectionEl && findBlockEl(sectionEl, blockId, {});
    if (blockEl && isFaqQuestionBlock(blockEl)) {
      const details = blockEl.tagName === 'DETAILS' ? blockEl : blockEl.closest('details.faq-item');
      if (details) closeFaqItem(details);
    }

    activeFaq = { sectionId: null, blockId: null };
    log('handleFaqBlockDeselect');
  }

  function reopenActiveFaq() {
    if (!activeFaq.sectionId || !activeFaq.blockId) return;

    const sectionEl = document.getElementById('shopify-section-' + activeFaq.sectionId);
    if (!sectionEl) return;

    previewFaqBlock(sectionEl, activeFaq.sectionId, activeFaq.blockId, {});
    log('reopenActiveFaq');
  }

  function getHeaderSectionEl() {
    return document.getElementById('MainHeader')?.closest('.shopify-section') || null;
  }

  function getMegamenuSearchRoots(sectionEl) {
    const roots = [];
    const seen = new Set();

    [sectionEl, getHeaderSectionEl()].forEach((root) => {
      if (root && !seen.has(root)) {
        seen.add(root);
        roots.push(root);
      }
    });

    return roots;
  }

  function collectMegamenuEditorBlocks(sectionEl) {
    const elements = [];
    const seen = new Set();

    getMegamenuSearchRoots(sectionEl).forEach((root) => {
      root.querySelectorAll('.megamenu[data-shopify-editor-block]').forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
        elements.push(el);
      });
    });

    return elements;
  }

  function resolveMegamenuFromEvent(evt, sectionEl, blockId) {
    const target = evt.target;

    if (target?.classList?.contains('megamenu')) {
      log('resolveMegamenuFromEvent: using evt.target');
      return target;
    }

    const closestMegamenu = target?.closest?.('.megamenu[data-shopify-editor-block]');
    if (closestMegamenu) {
      log('resolveMegamenuFromEvent: using evt.target.closest(.megamenu)');
      return closestMegamenu;
    }

    return findMegamenuElement(sectionEl, blockId);
  }

  function isHeaderSection(sectionDomId) {
    const headerSection = Woolman.Header?.cache?.section || getHeaderSectionEl();
    const result = headerSection?.id === sectionDomId;
    log('isHeaderSection', { sectionDomId, headerSectionId: headerSection?.id, result });
    return result;
  }

  function shouldUseDrawer() {
    const header = document.getElementById('MainHeader');
    const isDesktopDropdown = header?.classList.contains('desktop-dropdown');

    if (!isDesktopDropdown) {
      log('shouldUseDrawer', { isDesktopDropdown, result: true, reason: 'desktop submenu type is drawer' });
      return true;
    }

    // Shortcut nav with dropdowns is only visible from 1024px up (see critical.css)
    const shortcutNav = header?.querySelector('.header-shortlinks');
    const shortcutNavVisible = shortcutNav && window.getComputedStyle(shortcutNav).display !== 'none';
    const wideEnough = DESKTOP_NAV_MQ.matches || window.innerWidth >= 1024;
    const result = !shortcutNavVisible || !wideEnough;

    log('shouldUseDrawer', {
      isDesktopDropdown,
      shortcutNavVisible,
      wideEnough,
      innerWidth: window.innerWidth,
      mobileMqMatches: MOBILE_MQ.matches,
      desktopNavMqMatches: DESKTOP_NAV_MQ.matches,
      result,
    });
    return result;
  }

  function getDrawerMegamenuInstance(blockEl, sectionEl, blockId) {
    const matches = findMegamenuMatches(sectionEl, blockId);
    const fromMatches = matches.find((el) => el.closest('drawer-menu'));
    if (fromMatches) return fromMatches;

    const menuParent = blockEl?.dataset?.menuParent;
    if (menuParent) {
      const byParent = document.querySelector(
        `drawer-menu .megamenu[data-shopify-editor-block][data-menu-parent="${CSS.escape(menuParent)}"]`
      );
      if (byParent) return byParent;
    }

    return blockEl?.closest('drawer-menu') ? blockEl : null;
  }

  function getDropdownMegamenuInstance(blockEl, sectionEl, blockId) {
    const matches = findMegamenuMatches(sectionEl, blockId);
    return matches.find((el) => el.closest('header-dropdown'))
      || (blockEl?.closest('header-dropdown') ? blockEl : null);
  }

  function resolvePreviewMegamenu(blockEl, sectionEl, blockId) {
    if (!blockEl) return null;

    if (shouldUseDrawer()) {
      const drawerEl = getDrawerMegamenuInstance(blockEl, sectionEl, blockId);
      log('resolvePreviewMegamenu', {
        mode: 'drawer',
        sourceInDropdown: !!blockEl.closest('header-dropdown'),
        sourceInDrawer: !!blockEl.closest('drawer-menu'),
        resolvedInDrawer: !!drawerEl?.closest('drawer-menu'),
      });
      return drawerEl;
    }

    const dropdownEl = getDropdownMegamenuInstance(blockEl, sectionEl, blockId);
    log('resolvePreviewMegamenu', {
      mode: 'dropdown',
      sourceInDropdown: !!blockEl.closest('header-dropdown'),
      resolvedInDropdown: !!dropdownEl?.closest('header-dropdown'),
    });
    return dropdownEl;
  }

  function findMegamenuMatches(sectionEl, blockId) {
    const megamenuBlocks = collectMegamenuEditorBlocks(sectionEl);
    const matches = megamenuBlocks.filter((el) => {
      const data = getBlockData(el);
      return blockIdMatches(data?.id, blockId);
    });

    log('findMegamenuMatches', {
      blockId,
      megamenuBlocksInDom: megamenuBlocks.length,
      megamenuMatches: matches.length,
      domBlockIds: megamenuBlocks.map((el) => getBlockData(el)?.id),
      matchContexts: matches.map((el) => ({
        inDrawer: !!el.closest('drawer-menu'),
        inDropdown: !!el.closest('header-dropdown'),
        menuParent: el.dataset.menuParent,
      })),
    });
    return matches;
  }

  function findMegamenuElement(sectionEl, blockId) {
    const matches = findMegamenuMatches(sectionEl, blockId);
    if (!matches.length) {
      log('findMegamenuElement: no matches found');
      return null;
    }

    const useDrawer = shouldUseDrawer();
    const result = useDrawer
      ? matches.find((el) => el.closest('drawer-menu')) || matches[0]
      : matches.find((el) => el.closest('header-dropdown')) || matches[0];

    log('findMegamenuElement: selected instance', {
      useDrawer,
      inDrawer: !!result?.closest('drawer-menu'),
      inDropdown: !!result?.closest('header-dropdown'),
      menuParent: result?.dataset?.menuParent,
    });
    return result;
  }

  function closeMegamenuPreview() {
    log('closeMegamenuPreview');
    const header = document.getElementById('MainHeader');
    if (header) {
      header.querySelectorAll('header-dropdown details').forEach((details) => {
        details.removeAttribute('data-theme-editor-pin');
        const parentDropdown = details.closest('header-dropdown');
        parentDropdown?.clearCloseTimer?.();
        details.open = false;
      });
      header.classList.remove('sub-menu-open');
    }

    const drawerMenu = document.querySelector('drawer-menu');
    if (drawerMenu?.classList.contains('is-open')) {
      Woolman.ModalsAndDrawers?.closeModalOrDrawer('drawer-menu');
      log('closeMegamenuPreview: closed drawer-menu');
    } else {
      drawerMenu?.resetSubmenus?.();
    }
  }

  function openDropdownMegamenu(blockEl) {
    log('openDropdownMegamenu: start', { menuParent: blockEl?.dataset?.menuParent });

    const headerDropdown = blockEl.closest('header-dropdown');
    if (!headerDropdown) {
      log('openDropdownMegamenu: aborted — block is not inside header-dropdown');
      return;
    }

    const details = headerDropdown.querySelector('details');
    const header = document.getElementById('MainHeader');
    if (!details || !header) {
      log('openDropdownMegamenu: aborted — missing details or header', { hasDetails: !!details, hasHeader: !!header });
      return;
    }

    header.querySelectorAll('header-dropdown details[open]').forEach((openDetails) => {
      if (openDetails === details) return;
      openDetails.removeAttribute('data-theme-editor-pin');
      openDetails.open = false;
      openDetails.closest('header-dropdown')?.clearCloseTimer?.();
    });

    details.setAttribute('data-theme-editor-pin', '');
    details.open = true;
    header.classList.add('sub-menu-open');
    headerDropdown.clearCloseTimer?.();
    log('openDropdownMegamenu: success', { detailsOpen: details.open });
  }

  function openDrawerMegamenu(blockEl) {
    log('openDrawerMegamenu: start', { menuParent: blockEl?.dataset?.menuParent });

    const accordion = blockEl.closest('[data-accordion-item]');
    if (!accordion) {
      log('openDrawerMegamenu: aborted — no accordion ancestor');
      return;
    }

    const drawerMenu = document.querySelector('drawer-menu');
    if (!drawerMenu) {
      log('openDrawerMegamenu: aborted — drawer-menu element not found');
      return;
    }

    Woolman.ModalsAndDrawers.showModalOrDrawer('drawer-menu');
    log('openDrawerMegamenu: showModalOrDrawer called', { drawerAlreadyOpen: drawerMenu.classList.contains('is-open') });

    const openSubmenu = () => {
      drawerMenu.ensureSubmenuOpen?.(accordion);
      log('openDrawerMegamenu: ensureSubmenuOpen called', { accordionOpen: accordion.classList.contains('is-open') });
    };

    if (drawerMenu.classList.contains('is-open')) {
      openSubmenu();
      return;
    }

    const onTransitionEnd = () => {
      drawerMenu.removeEventListener('transitionend', onTransitionEnd);
      clearTimeout(fallbackTimer);
      log('openDrawerMegamenu: transitionend fired');
      openSubmenu();
    };
    drawerMenu.addEventListener('transitionend', onTransitionEnd);

    const fallbackTimer = setTimeout(() => {
      drawerMenu.removeEventListener('transitionend', onTransitionEnd);
      log('openDrawerMegamenu: transitionend fallback fired');
      openSubmenu();
    }, 300);
  }

  function openMegamenuPreview(blockEl) {
    log('openMegamenuPreview: start', {
      menuParent: blockEl?.dataset?.menuParent,
      hasMenuParent: !!blockEl?.dataset?.menuParent,
      inDropdown: !!blockEl?.closest('header-dropdown'),
      inDrawer: !!blockEl?.closest('drawer-menu'),
    });

    if (!blockEl?.dataset?.menuParent) {
      log('openMegamenuPreview: aborted — data-menu-parent is empty');
      return;
    }

    closeMegamenuPreview();

    const inDropdown = !!blockEl.closest('header-dropdown');
    const inDrawer = !!blockEl.closest('drawer-menu');

    if (inDrawer) {
      log('openMegamenuPreview: using drawer path');
      openDrawerMegamenu(blockEl);
    } else if (inDropdown) {
      log('openMegamenuPreview: using dropdown path');
      openDropdownMegamenu(blockEl);
    } else {
      log('openMegamenuPreview: aborted — megamenu is not inside header-dropdown or drawer-menu');
    }
  }

  function reopenActiveMegamenu() {
    log('reopenActiveMegamenu', { activeBlockId, activeSectionId });

    if (!activeBlockId || !activeSectionId) {
      log('reopenActiveMegamenu: aborted — no active block');
      return;
    }

    const sectionEl = document.getElementById('shopify-section-' + activeSectionId) || getHeaderSectionEl();
    if (!sectionEl) {
      log('reopenActiveMegamenu: aborted — section element not found');
      return;
    }

    const blockEl = findMegamenuElement(sectionEl, activeBlockId);
    const previewEl = resolvePreviewMegamenu(blockEl, sectionEl, activeBlockId);
    if (previewEl) {
      openMegamenuPreview(previewEl);
    } else {
      log('reopenActiveMegamenu: aborted — megamenu element not found in DOM');
    }
  }

  function handleModalBlockSelect(sectionId, blockId) {
    const sectionDomId = 'shopify-section-' + sectionId;
    const sectionEl = document.getElementById(sectionDomId);
    if (!sectionEl?.querySelector('[data-modal]')) return;

    const blocks = sectionEl.querySelectorAll('[data-shopify-editor-block]');
    const selectedBlock = [...blocks].find((el) => getBlockData(el)?.id === blockId);
    if (selectedBlock) {
      showModalForSection(sectionId);
    }
  }

  function handleBlockSelect(evt) {
    const { sectionId, blockId } = evt.detail;
    const sectionDomId = 'shopify-section-' + sectionId;
    log('shopify:block:select', { sectionId, blockId, sectionDomId });

    if (isHeaderSection(sectionDomId)) {
      activeBlockId = blockId;
      activeSectionId = sectionId;

      const sectionEl = document.getElementById(sectionDomId);
      if (!sectionEl) {
        log('handleBlockSelect: aborted — section element not found', { sectionDomId });
      } else {
        const blockEl = resolveMegamenuFromEvent(evt, sectionEl, blockId);
        const previewEl = resolvePreviewMegamenu(blockEl, sectionEl, blockId);
        if (previewEl) {
          openMegamenuPreview(previewEl);
        } else {
          log('handleBlockSelect: aborted — megamenu not in DOM (check menu_parent matches a top-level menu link)');
        }
      }
    }

    if (isModalSection(sectionId)) {
      handleModalBlockSelect(sectionId, blockId);
    }

    const sectionEl = document.getElementById(sectionDomId);
    if (sectionEl) {
      if (getGridySlider(sectionEl)) {
        previewGridyBlock(sectionEl, sectionId, blockId, evt);
      }
      if (isFaqSection(sectionEl)) {
        previewFaqBlock(sectionEl, sectionId, blockId, evt);
      }
    }
  }

  function handleBlockDeselect(evt) {
    const { sectionId, blockId } = evt.detail;
    log('shopify:block:deselect', { sectionId, blockId, activeBlockId });

    handleGridyBlockDeselect(sectionId, blockId);
    handleFaqBlockDeselect(sectionId, blockId);

    if (!isHeaderSection('shopify-section-' + sectionId)) return;
    if (activeBlockId !== blockId) return;

    activeBlockId = null;
    activeSectionId = null;
    closeMegamenuPreview();
  }

  function handleSectionLoad(evt) {
    const { sectionId } = evt.detail;
    const sectionDomId = 'shopify-section-' + sectionId;
    log('shopify:section:load', { sectionId, activeBlockId, activeSectionId });

    reinitHeaderIfNeeded(sectionDomId);
    if (getModalEl(sectionId)) {
      showModalForSection(sectionId);
    }

    if (activeGridy.sectionId === sectionId) {
      requestAnimationFrame(reopenActiveGridy);
    }
    if (activeFaq.sectionId === sectionId) {
      requestAnimationFrame(reopenActiveFaq);
    }

    if (!activeBlockId || activeSectionId !== sectionId) return;
    if (!isHeaderSection(sectionDomId)) return;

    requestAnimationFrame(reopenActiveMegamenu);
  }

  function handleSectionSelect(evt) {
    const { sectionId } = evt.detail;
    log('shopify:section:select', { sectionId });

    if (isModalSection(sectionId)) {
      showModalForSection(sectionId);
    }
  }

  function handleSectionDeselect(evt) {
    const { sectionId } = evt.detail;
    log('shopify:section:deselect', { sectionId, activeSectionId });

    if (activeSectionId && sectionId === activeSectionId) {
      activeBlockId = null;
      activeSectionId = null;
      closeMegamenuPreview();
    }

    if (isModalSection(sectionId)) {
      closeModalForSection(sectionId);
    }
  }

  let resizeFrame = null;

  function handleViewportChange() {
    if (resizeFrame) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = null;
      log('viewport change', {
        innerWidth: window.innerWidth,
        mobileMqMatches: MOBILE_MQ.matches,
        desktopNavMqMatches: DESKTOP_NAV_MQ.matches,
        activeBlockId,
      });
      if (activeBlockId) reopenActiveMegamenu();
      if (activeGridy.sectionId) reopenActiveGridy();
    });
  }

  function init() {
    log('init', {
      readyState: document.readyState,
      shopifyDesignMode: window.Shopify?.designMode,
      mainHeader: !!document.getElementById('MainHeader'),
      woolmanHeaderSection: Woolman?.Header?.cache?.section?.id,
      megamenuCount: document.querySelectorAll('.megamenu[data-shopify-editor-block]').length,
    });

    document.addEventListener('shopify:block:select', handleBlockSelect);
    document.addEventListener('shopify:block:deselect', handleBlockDeselect);
    document.addEventListener('shopify:section:load', handleSectionLoad);
    document.addEventListener('shopify:section:select', handleSectionSelect);
    document.addEventListener('shopify:section:deselect', handleSectionDeselect);
    MOBILE_MQ.addEventListener('change', handleViewportChange);
    DESKTOP_NAV_MQ.addEventListener('change', handleViewportChange);
    window.addEventListener('resize', handleViewportChange);

    log('init: event listeners registered');
  }

  if (document.readyState === 'loading') {
    log('waiting for DOMContentLoaded');
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
