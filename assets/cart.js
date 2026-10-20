class CartRemoveButton extends HTMLElement {
  constructor() {
    super();
    this.addEventListener('click', (event) => {
      event.preventDefault();
      this.closest('cart-items').updateQuantity(this.dataset.index, 0);
    });
  }
}
customElements.define('cart-remove-button', CartRemoveButton);

class CartItems extends HTMLElement {
  constructor() {
    super();

    // helper variables
    this.cartTotalValue = 0;
    this.cartTotalDiscount = 0;
    this.cartOriginalPrice = 0;

    // elements
    this.lineItemStatusElement = document.getElementById('shopping-cart-line-item-status');
    this.currentItemCount = Array.from(this.querySelectorAll('[name="updates[]"]')).reduce((total, quantityInput) => total + parseInt(quantityInput.value), 0);

    // events
    this.debouncedOnChange = debounce((event) => {
      this.onChange(event);
    }, 300);
    this.addEventListener('change', this.debouncedOnChange.bind(this));

    // Init items from API to prevent cart content missmatch on browser back/forward commands
    this.renderItems();

    // dev events
    document.addEventListener('ajaxProduct:added', (event) => {
      this.renderAndShowItems(event.detail)
    })

    // Free shipping check onload
    this.updateShippingNotification('cart-shipping-notification');
  }

  /**
   *  Debounced onChange event handler. Updates the cart when the user stops clicking quantity buttons.
   * @param {*} event
   */
  onChange(event) {
    this.updateQuantity(event.target.dataset.index, event.target.value, document.activeElement.getAttribute('name'));
  }

  /**
   * Returns an array of sections to render when the cart is updated. Limit: 5 sections.
   * Does not make the request to the server, only returns the section names to render.
   * @see https://shopify.dev/api/ajax/reference/cart#bundled-section-rendering
   * @returns {Array} Array of sections to render
   */
  getSectionItemsToRender() {
    return ['cart-items','cart-shipping-notification', 'cart-note', 'cart-footer'];
  }

  /**
   * This function is always called when the cart is updated.
   * @param {string} json
   */
  updateCartSections (newHTML) {
    this.getSectionItemsToRender().forEach((item) => {
      const elementToReplace = document.getElementById(item);

      if (!elementToReplace) return;

      // replace old with new
      elementToReplace.innerHTML = newHTML.getElementById(item).innerHTML;

      if (item === 'cart-shipping-notification') {
        this.updateShippingNotification('cart-shipping-notification');
      }
    });
  }

  /**
   * This function handles multi-currency support for the shipping notification bar.
   * This is called when item is added to cart or when the cart is updated.
   * @param {string} selector
   * @param {string*} json - Cart JSON
   */
  updateShippingNotification(selector) {
    const shippingNotificationWrapper = document.getElementById(selector);

    if (!shippingNotificationWrapper) {
      return;
    }

    const shippingNotification = shippingNotificationWrapper.querySelector('[data-free-shipping-notification]');

    let cartTotal = parseInt(shippingNotification.dataset.cartTotal, 10),
        freeShippingTreshold = parseInt(shippingNotification.dataset.threshold,10),
        shopCurrency = shippingNotification.dataset.shopCurrency,
        targetCurrency = shippingNotification.dataset.targetCurrency;

    if (shopCurrency !== targetCurrency) {
      cartTotal = Math.round(cartTotal / (parseFloat(Shopify.currency.rate) || 1 ));
    }

    if (cartTotal > freeShippingTreshold) {
      shippingNotification.classList.add('threshold-reached')
      shippingNotification.querySelector('span').innerHTML = window.cartStrings.shipping_free;
    } else {
      let missingAmount = freeShippingTreshold - cartTotal,
          message = window.cartStrings.shipping_not_free.replace('[amount]', Woolman.Utils.formatMoney(missingAmount));

      shippingNotification.classList.remove('threshold-reached')
      shippingNotification.querySelector('span').innerHTML = message;
    }
  }

  /**
   * Fetches fresh sections from the server and updates the cart.
   * @see https://shopify.dev/api/ajax/reference/cart#bundled-section-rendering
   * @returns {Promise} Promise that resolves when the cart is updated
   */
  async renderItems() {
    fetch(`${routes.cart_url}?section_id=main-cart`)
      .then((response) => response.text())
      .then((responseText) => {
        const html = new DOMParser().parseFromString(responseText, 'text/html');
        this.updateCartSections(html);
      })
      .catch((e) => {
        console.error(e);
      });
  }

  /**
   * Fetches fresh sections from the server and updates the cart. This is called when item is added to cart.
   * @see https://shopify.dev/api/ajax/reference/cart#bundled-section-rendering
   * @returns {Promise} Promise that resolves when the cart is updated
   */
  async renderAndShowItems(detail = {}) {
    const parentDrawer = this.closest('[data-drawer]');
    const { limitedItems, onLimitedUnmatched } = detail || {};
    const previousQuantities = limitedItems ? this.getCurrentQuantities(limitedItems) : null;

    fetch(`${routes.cart_url}?section_id=main-cart`)
      .then((response) => response.text())
      .then((responseText) => {
        const html = new DOMParser().parseFromString(responseText, 'text/html');
        this.updateCartSections(html);

        // Limited availability: warn on each line that received less than requested.
        // If nothing can be shown in the cart, let the caller show its own message.
        if (limitedItems) {
          if (!this.showLimitedWarnings(limitedItems, previousQuantities)) {
            if (typeof onLimitedUnmatched === 'function') onLimitedUnmatched();
            return;
          }
        }

        if (!parentDrawer) return;
        Woolman.ModalsAndDrawers.showModalOrDrawer(parentDrawer.getAttribute('id'))
      })
      .catch((e) => {
        console.error(e);
      });
  }

  /**
   * Updates the quantity of a line item in the cart. This is called when the user changes the quantity of an item in the cart.
   * @param {*} line
   * @param {*} quantity
   * @param {*} name
   */
  async updateQuantity(line, quantity, name) {
    this.enableLoading(line);
    fetch(`${routes.cart_change_url}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: `application/json`,
      },
      body: JSON.stringify({
        line: line,
        quantity: quantity,
        sections: 'main-cart',
        sections_url: window.location.pathname,
      }),
    })
    .then(async (response) => ({ status: response.status, responseJson: await response.json() }))
    .then(async ({ status, responseJson }) => {

      const quantityElement = document.getElementById(`Quantity-${line}`);
      const items = document.querySelectorAll('.cart-item');

      if (responseJson.errors) {
        // 422: availability limited the change. Shopify still changes the quantity (to what's in stock) but sends no
        // sections, so render the cart from the server and show the message as a warning on the line.
        if (status === 422) {
          const variantId = document.getElementById(`CartItem-${line}`)?.dataset.variantId;
          await this.renderAfterLimitedChange(variantId, responseJson.errors);
          return;
        }
        quantityElement.value = quantityElement.getAttribute('value');
        this.updateLiveRegions(line, responseJson.errors);
        return;
      }

      const event = new CustomEvent('cart:update', { detail: responseJson,});
      document.dispatchEvent(event);

      // Render new items according to response
      const html = new DOMParser().parseFromString(responseJson.sections['main-cart'], 'text/html');
      this.updateCartSections(html);

      const lineItem = document.getElementById(`CartItem-${line}`);
      if (lineItem && lineItem.querySelector(`[name="${name}"]`)) lineItem.querySelector(`[name="${name}"]`).focus();
    })
    .catch((error) => {
      console.error(error);
    })
    .finally(() => {
      this.disableLoading();
    });
  }

  /**
   * After a quantity change that availability limited: renders the cart as it is now on the server, updates the cart
   * count and shows a warning with the new quantity on the changed line (e.g. "Amount set to 9 due to availability.").
   * @param {string|undefined} variantId - Variant of the changed line; lines may be renumbered after rendering
   * @param {string} message - Message from the cart API, used if the theme string is missing
   */
  async renderAfterLimitedChange(variantId, message) {
    try {
      const [sectionResponse, cartResponse] = await Promise.all([
        fetch(`${routes.cart_url}?section_id=main-cart`),
        fetch(`${routes.cart_url}.js`),
      ]);
      const html = new DOMParser().parseFromString(await sectionResponse.text(), 'text/html');
      const cart = await cartResponse.json();
      this.updateCartSections(html);
      document.dispatchEvent(new CustomEvent('cart:update', { detail: cart }));

      const lineItem = variantId ? this.querySelector(`.cart-item[data-variant-id="${variantId}"]`) : null;
      if (!lineItem) return;
      const quantity = cart.items
        .filter((item) => String(item.variant_id) === String(variantId))
        .reduce((total, item) => total + item.quantity, 0);
      const warning = window.cartStrings?.quantityAdjusted?.replace('[quantity]', quantity) || message;
      this.updateLiveRegions(lineItem.id.replace('CartItem-', ''), warning, true);
    } catch (e) {
      console.error(e);
    }
  }

  /**
   * Sums requested quantities per variant id.
   * @param {Array<{id: number, quantity: number}>} items
   * @returns {Object} variant id => requested quantity
   */
  getRequestedQuantities(items) {
    const quantities = {};
    items.forEach(({ id, quantity }) => {
      quantities[id] = (quantities[id] || 0) + quantity;
    });
    return quantities;
  }

  /**
   * Returns the quantities currently rendered in the cart for the requested variants.
   * @param {Array<{id: number, quantity: number}>} items
   * @returns {Object} variant id => quantity in cart
   */
  getCurrentQuantities(items) {
    const quantities = {};
    items.forEach(({ id }) => {
      quantities[id] = this.getVariantQuantity(id);
    });
    return quantities;
  }

  /**
   * Compares what was requested with what the cart now holds and shows a warning on every limited line.
   * @param {Array<{id: number, quantity: number}>} items - Requested items
   * @param {Object} previousQuantities - Variant quantities in the cart before the add
   * @returns {boolean} True when at least one warning was shown and all limited items have a cart line
   */
  showLimitedWarnings(items, previousQuantities) {
    const strings = window.cartStrings;
    const requested = this.getRequestedQuantities(items);
    let warned = 0;
    let missing = 0;

    // Start a fresh announcement for screen readers (updateLiveRegions appends each warning)
    const liveRegion = document.getElementById('cart-live-region-text');
    if (liveRegion) liveRegion.textContent = '';

    Object.keys(requested).forEach((variantId) => {
      const lineItem = this.querySelector(`.cart-item[data-variant-id="${variantId}"]`);
      const currentQuantity = this.getVariantQuantity(variantId);
      const previousQuantity = previousQuantities[variantId] || 0;
      const added = currentQuantity - previousQuantity;
      // An add never lowers a quantity, so a negative difference means the drawer was out of date: skip
      if (added < 0 || added >= requested[variantId]) return;

      // Nothing was added for this line. Shopify rejects a whole multi-item request when one item cannot be added,
      // so only a single-variant request can be attributed to this line, and only if it was already in the cart.
      if (added === 0 && (previousQuantity === 0 || Object.keys(requested).length > 1)) {
        missing++;
        return;
      }

      if (!lineItem) {
        missing++;
        return;
      }

      let message = null;
      if (added > 0) {
        message = (added === 1 ? strings.quantityLimitedOne : strings.quantityLimited)?.replace('[quantity]', added);
      } else {
        message = strings.quantityMaxReached?.replace('[quantity]', currentQuantity);
      }
      if (!message) return;

      this.updateLiveRegions(lineItem.id.replace('CartItem-', ''), message, true);
      warned++;
    });

    return warned > 0 && missing === 0;
  }

  /**
   * Returns the total quantity of a variant currently rendered in the cart.
   * @param {string|number} variantId
   * @returns {number}
   */
  getVariantQuantity(variantId) {
    return Array.from(this.querySelectorAll(`.cart-item[data-variant-id="${variantId}"] [name="updates[]"]`))
      .reduce((total, input) => total + (parseInt(input.value, 10) || 0), 0);
  }

  /**
   * Updates the live regions for the cart.
   * @param {*} line
   * @param {*} message
   * @param {boolean} isWarning - Show the message as a warning instead of an error
   */
  updateLiveRegions(line, message, isWarning = false) {
    const lineItemError =
      document.getElementById(`Line-item-error-${line}`) || document.getElementById(`CartDrawer-LineItemError-${line}`);
    if (lineItemError) {
      lineItemError.querySelector('.cart-item__error-text').textContent = message;
      lineItemError.classList.toggle('cart-item__error--warning', isWarning);
      lineItemError.classList.remove('hide');
    }

    this.lineItemStatusElement.setAttribute('aria-hidden', true);

    const cartStatus = document.getElementById('cart-live-region-text');
    // Announce the message to screen readers; warnings from one add are appended to each other
    cartStatus.textContent = isWarning && cartStatus.textContent ? `${cartStatus.textContent} ${message}` : message;
    cartStatus.setAttribute('aria-hidden', false);

    setTimeout(() => {
      cartStatus.setAttribute('aria-hidden', true);
    }, 1000);
  }

  enableLoading(line) {
    this.classList.add('is-processing');
    this.querySelectorAll(`#CartItem-${line} .loading-overlay`).forEach((overlay) => overlay.classList.remove('hidden'));
    document.activeElement.blur();
  }

  disableLoading() {
    this.classList.remove('is-processing');
    this.querySelectorAll('.loading-overlay').forEach((overlay) => overlay.classList.add('hidden'));
  }
}
customElements.define('cart-items', CartItems);

if (!customElements.get('cart-note')) {
  customElements.define('cart-note', class CartNote extends HTMLElement {
    constructor() {
      super();

      this.addEventListener('keyup', debounce((event) => {
        const body = JSON.stringify({ note: event.target.value });
        fetch(`${routes.cart_update_url}`, {
          method: 'POST',
          headers: {
           'Content-Type': 'application/json',
            Accept: `application/json`,
          },
          ...{ body }
        });
      }, 300))
    }
  });
};

if (!customElements.get('cart-recommendations')) {
  customElements.define('cart-recommendations', class CartRecommendations extends HTMLElement {
    constructor() {
      super();
    }

    connectedCallback() {
      this._boundLoadRecommendations = (e) => {
        const productId = e.detail?.productId ?? this.dataset.productId;
        this.loadRecommendations(productId);
      };
      this._boundCartUpdate = (e) => {
        const itemCount = e.detail?.item_count;
        if (itemCount === 0) {
          this.classList.add('hide');
          this.setAttribute('hidden', true);
          delete this.dataset.productId;
          return;
        }
        this._refreshRecommendationsIfFirstProductChanged(e.detail);
      };
      this.loadRecommendations(this.dataset.productId);
      document.addEventListener('ajaxProduct:added', this._boundLoadRecommendations);
      document.addEventListener('cart:update', this._boundCartUpdate);
    }

    disconnectedCallback() {
      document.removeEventListener('ajaxProduct:added', this._boundLoadRecommendations);
      document.removeEventListener('cart:update', this._boundCartUpdate);
    }

    /**
     * Refreshes recommendations only when the first cart item's product changes.
     * @param {Object} detail - cart:update event detail (may include items, item_count)
     */
    async _refreshRecommendationsIfFirstProductChanged(detail) {
      let firstProductId = detail?.items?.[0]?.product_id;
      if (firstProductId == null && detail?.item_count > 0) {
        try {
          const res = await fetch(`${routes.cart_url}.js`);
          const cart = await res.json();
          firstProductId = cart?.items?.[0]?.product_id;
        } catch (e) {
          return;
        }
      }
      if (firstProductId == null) return;
      const currentProductId = this.dataset.productId ?? '';
      // Hand-picked products leave out what's in the cart, so they depend on every line, not only the first
      if (!this.hasAttribute('data-handpicked') && String(firstProductId) === currentProductId) return;
      this.dataset.productId = String(firstProductId);
      this.removeAttribute('hidden');
      this.classList.remove('hide');
      this.loadRecommendations();
    }

    /**
     * Loads recommendations for the given product (or current dataset.productId).
     * @param {string|number|undefined} productId - Optional; when provided, used for the request and synced to dataset
     */
    async loadRecommendations(productId) {
      const id = productId ?? this.dataset.productId;
      if (!id || String(id) === '') return;
      if (productId != null) this.dataset.productId = String(productId);

      await this._loadProductCard();
    }

    /**
     * Animates the heading and then each recommendation in, one after another (component-cart-recommendations.css).
     */
    animateIn() {
      const elements = [
        this.querySelector('.cart-recommendations__title'),
        ...this.querySelectorAll('[data-products-ajax] > *'),
      ].filter(Boolean);
      elements.forEach((element, index) => {
        element.style.setProperty('--recommendation-index', index);
        element.classList.add('recommendation-animate-in');
      });
    }

    async _loadProductCard() {
      try {
        let url = `${this.dataset.url}&product_id=${this.dataset.productId}&section_id=${this.dataset.sectionId}`;
        if (this.dataset.intent) url += `&intent=${encodeURIComponent(this.dataset.intent)}`;
        const res = await fetch(url);
        const text = await res.text();
        // Parse in a separate document: the response is the whole cart section, and setting it as innerHTML of an
        // element in this document would create its <cart-items>, whose constructor re-renders the real cart (wiping
        // line item warnings) and leaves an extra listener for every later add to cart.
        const html = new DOMParser().parseFromString(text, 'text/html');
        const recommendations = html.querySelector('cart-recommendations');
        // Products, not just any markup: an empty result can still contain the section's wrapper
        if (recommendations?.querySelector('[data-products-ajax] > *')) {
          const newHtml = recommendations.innerHTML;
          // Same recommendations as shown (e.g. the same product added again): keep them without animating again
          if (newHtml !== this._renderedHtml) {
            this.innerHTML = newHtml;
            this._renderedHtml = newHtml;
            this.animateIn();
          }
          this.removeAttribute('hidden');
          this.classList.remove('hide');
          this.classList.add('products-loaded');
        } else {
          this._renderedHtml = null;
          this.setAttribute('hidden', true);
          this.classList.add('hide');
        }
      } catch (e) {
        console.error(e);
        this.setAttribute('hidden', true);
        this.classList.add('hide');
      }
    }
  });
}