if (!customElements.get('product-form')) {
  customElements.define('product-form', class ProductForm extends HTMLElement {
    constructor() {
      super();
      this.multi_item_request = false;
    }

    connectedCallback() {
      if (this._productFormInitialized) return;
      this.form = this.querySelector('form');
      if (!this.form) return;
      const idInput = this.form.querySelector('[name=id]');
      if (idInput) idInput.disabled = false;
      this._boundSubmitHandler = this.onSubmitHandler.bind(this);
      this.form.addEventListener('submit', this._boundSubmitHandler);
      this.submitButton = this.querySelector('[type="submit"]');
      this.cartNotification = document.getElementById('cart-notification');
      this.cartNotificationItem = document.getElementById('cart-notification-item');
      this._productFormInitialized = true;
    }

    disconnectedCallback() {
      if (this.form && this._boundSubmitHandler) {
        this.form.removeEventListener('submit', this._boundSubmitHandler);
      }
      this._productFormInitialized = false;
    }

    /**
     * Resolves product id for ajaxProduct:added from add response and existing DOM/form.
     * @param {Object} json - Cart add API response
     * @returns {string|number|undefined}
     */
    getProductIdForEvent(json) {
      if (json?.product_id != null) return json.product_id;
      if (json?.items?.[0]?.product_id != null) return json.items[0].product_id;
      const fromPicker = this.querySelector('[data-product-id]')?.dataset?.productId;
      if (fromPicker != null && fromPicker !== '') return fromPicker;
      const fromParent = this.closest('[data-product]')?.dataset?.product;
      if (fromParent != null && fromParent !== '') return fromParent;
      // form.id can be shadowed by the form's <input name="id">, so read the attribute
      const formId = this.form?.getAttribute('id') ?? '';
      if (/^product-form-\d+$/.test(formId)) return formId.replace(/^product-form-/, '');
      if (formId.includes('-upsell-')) return formId.split('-upsell-')[1] ?? '';
      if (json?.id != null) return json.id;
      return undefined;
    }

    /**
     * Resolves the product id of a requested variant from its cart line. Used after a limited availability (422)
     * add, whose response has no product data, when the form doesn't carry the product id either.
     * @param {Array<{id: number}>} items - Requested items
     * @returns {Promise<number|undefined>}
     */
    async getProductIdFromCart(items) {
      try {
        const res = await fetch(`${routes.cart_url}.js`);
        const cart = await res.json();
        const variantIds = items.map(({ id }) => String(id));
        return cart.items?.find((item) => variantIds.includes(String(item.variant_id)))?.product_id;
      } catch (e) {
        return undefined;
      }
    }

    /**
     * Returns the quantities of the given variants in the cart.
     * @param {Array<{id: number}>} items
     * @returns {Promise<Object|null>} variant id => quantity, or null if the cart couldn't be read
     */
    async getCartQuantities(items) {
      try {
        const res = await fetch(`${routes.cart_url}.js`);
        const cart = await res.json();
        const quantities = {};
        items.forEach(({ id }) => {
          quantities[id] = cart.items
            .filter((item) => String(item.variant_id) === String(id))
            .reduce((total, item) => total + item.quantity, 0);
        });
        return quantities;
      } catch (e) {
        return null;
      }
    }

    /**
     * After a limited availability add without the cart drawer: shows a warning and updates the cart count.
     * Cart type "Notification" opens the notification with the warning on the cart line; cart type "Page" shows the
     * warning in the product form's message area.
     * @param {{id: number, quantity: number}} requested - The requested variant and quantity
     * @param {Object|null} previousQuantities - Variant quantities before the add; null when only one was requested
     * @returns {Promise<boolean>} False when the cart has no line for the variant, so the caller shows the error
     */
    async showLimitedWarning(requested, previousQuantities) {
      let cart;
      try {
        const res = await fetch(`${routes.cart_url}.js`);
        cart = await res.json();
      } catch (e) {
        return false;
      }

      const lines = cart.items.filter((item) => String(item.variant_id) === String(requested.id));
      if (!lines.length) return false;

      const currentQuantity = lines.reduce((total, item) => total + item.quantity, 0);
      // With a quantity of 1, a limited add means nothing was added
      const previousQuantity = previousQuantities ? previousQuantities[requested.id] || 0 : currentQuantity;
      const added = currentQuantity - previousQuantity;
      if (added < 0 || added >= requested.quantity) return false;

      const strings = window.cartStrings;
      const warning = added > 0
        ? (added === 1 ? strings.quantityLimitedOne : strings.quantityLimited).replace('[quantity]', added)
        : strings.quantityMaxReached.replace('[quantity]', currentQuantity);

      if (this.cartNotification) {
        // Nothing added: show the warning without the "added to cart" title
        this.showCartNotification({ title: added > 0 ? window.variantStrings.itemAdded : '', items: [lines[0]], warning });
      } else {
        this.handleErrorMessage(warning, true);
      }
      document.dispatchEvent(new CustomEvent('ajaxProduct:added', { detail: { productId: lines[0].product_id } }));
      return true;
    }

    /**
     * Opens the cart notification (cart type "Notification").
     * @param {Object} options
     * @param {string} options.title - Notification title; the heading is hidden when empty
     * @param {Array<Object>} options.items - Line items from the cart API
     * @param {string} [options.warning] - Optional limited availability warning
     */
    showCartNotification({ title, items, warning }) {
      const notificationTemplate = document.importNode(this.cartNotification.content, true);

      if (title) {
        notificationTemplate.querySelector('[data-notification-title]').textContent = title;
      } else {
        notificationTemplate.querySelector('[data-notification-heading]')?.classList.add('hide');
      }

      items.forEach((item) => {
        notificationTemplate.querySelector('[data-items]').appendChild(this.createNotificationItem(item));
      });

      const warningElement = notificationTemplate.querySelector('[data-notification-warning]');
      if (warning && warningElement) {
        warningElement.querySelector('.cart-item__error-text').textContent = warning;
        warningElement.classList.remove('hide');
      }

      if (document.querySelector('.cart-notification')) {
        document.querySelector('.cart-notification').remove();
      }

      document.body.appendChild(notificationTemplate);

      const the_notification = document.querySelector('.cart-notification');

      // Set focus to the notification for accessibility
      the_notification.setAttribute('tabindex', '-1');
      the_notification.focus();

      the_notification.querySelector('.notification-close').addEventListener('click', () => {
        the_notification.classList.remove('anim-in');
      });
      setTimeout(() => {
        the_notification.classList.add('anim-in');
      }, 50);
    }

    async onSubmitHandler(evt) {
      evt.preventDefault();
      if (this.submitButton.getAttribute('aria-disabled') === 'true') return;

      this.handleErrorMessage();

      this.submitButton.setAttribute('aria-disabled', true);
      this.submitButton.classList.add('loading');
      this.querySelector('.loading-overlay').classList.remove('hidden');

      // Upsell items handled only in JS
      const upsell_ids_nodes = document.querySelectorAll(`[data-form="${this.form.getAttribute('id')}"] .upsell-id`);
      const upsell_quantities_nodes = document.querySelectorAll(`[data-form="${this.form.getAttribute('id')}"] .upsell-quantity`);
      let upsell_items = [];

      if (upsell_ids_nodes.length !== 0) {
        const upsell_ids = Array.from(upsell_ids_nodes).map(input => parseInt(input.value));
        const upsell_quantities = Array.from(upsell_quantities_nodes).map(input => parseInt(input.value));
        upsell_items = upsell_ids.map((id, index) => ({'id': id,'quantity': upsell_quantities[index]})).filter(item => item.quantity !== 0);
      }

      const config = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/javascript',
        }
      }
      config.headers['X-Requested-With'] = 'XMLHttpRequest';
      delete config.headers['Content-Type'];
      const formData = new FormData(this.form);

      // If upsell items added refactor FormData
      if (upsell_items.length > 0) {
        this.multi_item_request = true;
        const items = upsell_items;
        const id = parseInt(formData.get('id'));
        const quantity = parseInt(formData.get('quantity')) || 1;
        const the_product_item = { 'id': id, 'quantity': quantity }

        items.push(the_product_item);
        const itemsData = { 'items': items };

        config.headers['Content-Type'] = 'application/json';
        config.body = JSON.stringify(itemsData);
      } else {
        this.multi_item_request = false;
        config.body = formData;
      }

      // Requested variants and quantities, used to detect limited availability after the add
      const requestedItems = this.multi_item_request
        ? upsell_items.map(({ id, quantity }) => ({ id, quantity }))
        : [{ id: parseInt(formData.get('id')), quantity: parseInt(formData.get('quantity')) || 1 }];

      // Without the cart drawer (cart types "Notification" and "Page") there's no cart line to read the quantity from,
      // so read it from the cart before an add of more than one item: it's needed to tell how many were added if
      // availability limits the add.
      const hasCartDrawer = !!document.getElementById('drawer-cart');
      const previousQuantities = !hasCartDrawer && !this.multi_item_request && requestedItems[0].quantity > 1
        ? await this.getCartQuantities(requestedItems)
        : null;

      try {
        const res = await fetch(routes.cart_add_url + '.js', config)
        const json = await res.json();

        if (res.status !== 200) {
          // 422 with a description means limited availability: the available quantity is added to the cart anyway.
          if (res.status === 422 && json.description && hasCartDrawer) {
            // The error response has no product data, so fall back to the cart line of the requested variant
            const productId = this.getProductIdForEvent(json) ?? await this.getProductIdFromCart(requestedItems);
            document.dispatchEvent(new CustomEvent('ajaxProduct:added', { detail: {
              ...(productId != null ? { productId } : {}),
              limitedItems: requestedItems,
              onLimitedUnmatched: () => this.handleErrorMessage(json.description)
            }}));
            this.finishSubmit();
            return;
          }
          // Notification and Page: show a warning (in the notification or the product form) instead of an error.
          // A multi-item request is rejected as a whole, so it keeps the error.
          if (res.status === 422 && json.description && !this.multi_item_request
            && await this.showLimitedWarning(requestedItems[0], previousQuantities)) {
            this.finishSubmit();
            return;
          }
          throw new Error(json.description);
        }

        if (this.cartNotification) {
          if (this.multi_item_request) {
            let lastElement = json.items.pop();
            json.items.unshift(lastElement);
            this.showCartNotification({ title: window.variantStrings.itemsAdded, items: json.items });
          } else {
            this.showCartNotification({ title: window.variantStrings.itemAdded, items: [json] });
          }
        }

        const productId = this.getProductIdForEvent(json);
        const event = new CustomEvent('ajaxProduct:added', { detail: productId != null ? { productId } : {} });
        document.dispatchEvent(event);
      } catch(error) {
        this.handleErrorMessage(error);
        console.error(error);
      }

      this.finishSubmit();
    }

    finishSubmit() {
      this.submitButton.classList.remove('loading');
      this.submitButton.removeAttribute('aria-disabled');
      this.querySelector('.loading-overlay').classList.add('hidden');
      this.resetQuantityInput();
    }

    /**
     * Shows or hides the product form's message.
     * @param {string|Error|false} errorMessage - Message to show; false hides it
     * @param {boolean} isWarning - Show the message in the warning style (limited availability) instead of as an error
     */
    handleErrorMessage(errorMessage = false, isWarning = false) {
      this.errorMessageWrapper = this.errorMessageWrapper || this.querySelector('.product-form__error-message-wrapper') || document.querySelector(`.product-form__error-message-wrapper[form="${this.form.getAttribute('id')}"]`)
      if (!this.errorMessageWrapper) return;
      this.errorMessage = this.errorMessage || this.errorMessageWrapper.querySelector('.product-form__error-message');

      this.errorMessageWrapper.toggleAttribute('hidden', !errorMessage);
      this.errorMessageWrapper.classList.toggle('product-form__error-message-wrapper--warning', Boolean(errorMessage) && isWarning);

      if (errorMessage) {
        this.errorMessage.textContent = errorMessage.message || errorMessage;
      }
    }

    resetQuantityInput() {
      const hidden_quantity_input = document.querySelector('[type=hidden][name=quantity]');
      if (hidden_quantity_input) {
        hidden_quantity_input.value = 1;
      }
    }

    createNotificationItem(product) {
      const notificationItemTemplate = document.importNode(this.cartNotificationItem.content, true);

      const filename = product.image.split('/').pop();
      const lastDotIndex = filename.lastIndexOf('.');
      const newFilename = `${filename.substring(0, lastDotIndex)}_120x${filename.substring(lastDotIndex)}`;
      const url = product.image.replace(filename, newFilename);

      notificationItemTemplate.querySelector('.notification-item-image').setAttribute('src', url);
      notificationItemTemplate.querySelector('.notification-item-image').classList.remove('hide');
      notificationItemTemplate.querySelector('.notification-item-title').textContent = product.product_title;

      product.options_with_values.forEach(item => {
        const row = document.createElement("dl");
        const nameCell = document.createElement("dt");
        const valueCell = document.createElement("dd");

        nameCell.textContent = item.name + ': ';
        valueCell.textContent = item.value;

        row.appendChild(nameCell);
        row.appendChild(valueCell);
        notificationItemTemplate.querySelector('.notification-item-details').appendChild(row);
      })

      const propertyKeyValues = Object.entries(product.properties);
      if (propertyKeyValues.length > 0) {
        const properties = document.createElement("dl");
        propertyKeyValues.forEach(([key, value]) => {
          const startsWith = key.startsWith('_');
          if (startsWith) return;
          const row = document.createElement("dl");
          const nameCell = document.createElement("dt");
          const valueCell = document.createElement("dd");

          nameCell.textContent = key + ': ';
          valueCell.textContent = value;

          row.appendChild(nameCell);
          row.appendChild(valueCell);
          properties.appendChild(row);
        });
        notificationItemTemplate.querySelector('.notification-item-details').appendChild(properties);
      }

      return notificationItemTemplate;
    }
  });
}

class AddMultiplier extends HTMLElement {
  constructor() {
    super();

    const multiplyButton = this.querySelector('button');
    this.submitEvent = new SubmitEvent("submit", { submitter: multiplyButton });
    this.multiplyBy = parseInt(this.querySelector('[name=multiplied-quantity]').value);
    this.productForm = this.closest('product-form').querySelector('form');
    const formId = this.productForm.getAttribute('id');
    this.quantity_input = document.querySelector(`[name=quantity][form=${ formId }]`);
    multiplyButton.addEventListener('click', this.submitProductForm.bind(this));
  }

  submitProductForm() {
    this.quantity_input.value = this.multiplyBy;
    this.productForm.dispatchEvent(this.submitEvent);
  }
}
customElements.define("add-multiplier", AddMultiplier);
