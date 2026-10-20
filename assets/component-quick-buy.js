if (customElements.get('quick-buy') === undefined) {

  customElements.define('quick-buy', class QuickBuy extends HTMLElement {
    constructor() {
      'use strict';
      super();

      this.processingModal = false;
      this.button = this.querySelector('a[href*="modal"]');

      if (!this.button) {
        console.error('Quick buy button not found');
        return;
      }

      this.targetModalId = this.button.getAttribute('href').substring(1);
      this.quickBuyProductHandle = this.button.dataset.productHandle;
      this.rootUrl = window.routes.root == '/' ? '/' : window.routes.root + '/'; // if user has selected locale convert root url from /en-gb to /en-gb/

      // Extract product ID from modal ID (format: modal-{productId}-product)
      const modalIdMatch = this.targetModalId.match(/modal-(\d+)-product/);
      const productId = modalIdMatch ? modalIdMatch[1] : this.quickBuyProductHandle;

      // Set missing dataset properties
      this.dataset.product = productId;
      this.dataset.url = this.button.dataset.url || window.location.origin + '/products/' + this.quickBuyProductHandle;

      this.button.addEventListener('click', this.onModalRequestOpen.bind(this))
    }

    async onModalRequestOpen(event) {
      event.preventDefault();
      if (this.processingModal === true) {
        return;
      }

      this.button.classList.add('loading');
      this.button.querySelector('.loading-overlay')?.classList.remove('hidden');

      let modal = document.getElementById(this.targetModalId);

      // The modal may still show a sibling product if it was closed without cleanup (e.g. with Esc)
      if (modal && modal.dataset.productId && modal.dataset.productId !== this.dataset.product) {
        modal.remove();
        modal = null;
      }

      if (modal) {
        Woolman.ModalsAndDrawers.showModalOrDrawer(this.targetModalId);
        this.button.classList.remove('loading');
        this.button.querySelector('.loading-overlay')?.classList.add('hidden');
        return;
      };

      this.processingModal = true;

      // Clean up any existing quick buy modals
      document.querySelectorAll('[data-quick-buy-modal]').forEach((modal) => {
        modal.remove();
      })

      try {
        const res = await fetch(`${this.rootUrl}products/${this.quickBuyProductHandle}?view=ajax-modal`)

        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }

        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');

        const modalElement = doc.body.firstChild;
        document.body.appendChild(modalElement);
        setTimeout(() => {
          this.button.classList.remove('loading');
          this.button.querySelector('.loading-overlay')?.classList.add('hidden');
          Woolman.ModalsAndDrawers.showModalOrDrawer(this.targetModalId);
        }, 100);

        this.modal = modalElement;
        this.hookEvents();
      } catch (error) {
        console.error('Error loading quick buy modal:', error);
        this.button.classList.remove('loading');
        this.button.querySelector('.loading-overlay')?.classList.add('hidden');
        this.processingModal = false;
      }
    }

    hookEvents() {
      const closeButton = this.modal.querySelector('[data-close]');
      if (closeButton) {
        closeButton.addEventListener('click', (e) => {
          Woolman.ModalsAndDrawers.closeModalOrDrawerOrDrawerFromEvent(e);
          setTimeout(() => this.cleanupModal(), 300);
        });
      }

      const overlay = this.modal.querySelector('[data-overlay]');
      if (overlay) {
        overlay.addEventListener('click', (e) => {
          Woolman.ModalsAndDrawers.closeModalOrDrawerOrDrawerFromEvent(e);
          setTimeout(() => this.cleanupModal(), 300);
        });
      }

      this.modal.addEventListener('click', this.onSiblingClick.bind(this));
      this.hookProductForm();

      this.processingModal = false;
    }

    hookProductForm() {
      // Query inside the modal, as the form id changes when the content is swapped to another product
      this.productForm = this.modal.querySelector('form[data-type="add-to-cart-form"]');
      if (this.productForm) {
        this.boundHandleSubmit = this.boundHandleSubmit || this.handleSubmit.bind(this);
        this.productForm.addEventListener('submit', this.boundHandleSubmit);
      }
    }

    onSiblingClick(event) {
      const link = event.target.closest('a[data-quick-view-sibling]');
      if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
        return;
      }

      event.preventDefault();
      if (link.getAttribute('aria-current') === 'page' || this.swappingProduct) {
        return;
      }

      this.swapToSibling(link);
    }

    async swapToSibling(link) {
      this.swappingProduct = true;
      link.classList.add('loading');
      link.setAttribute('aria-busy', 'true');

      try {
        const url = new URL(link.href);
        url.searchParams.set('view', 'ajax-modal');
        const res = await fetch(url);

        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }

        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const newModal = doc.body.firstChild;
        const newBody = newModal.querySelector('[data-modal-body]');
        const currentBody = this.modal.querySelector('[data-modal-body]');

        if (!newBody || !currentBody) {
          throw new Error('Quick view modal body not found');
        }

        if (this.productForm) {
          this.productForm.removeEventListener('submit', this.boundHandleSubmit);
        }

        currentBody.innerHTML = newBody.innerHTML;

        const newDialog = newModal.querySelector('[data-modal-dialog]');
        const currentDialog = this.modal.querySelector('[data-modal-dialog]');
        if (newDialog && currentDialog) {
          currentDialog.setAttribute('aria-labelledby', newDialog.getAttribute('aria-labelledby'));
        }
        this.modal.dataset.productId = newModal.dataset.productId;

        this.hookProductForm();
        this.modal.querySelector('a[data-quick-view-sibling][aria-current="page"]')?.focus({ preventScroll: true });
      } catch (error) {
        console.error('Error loading sibling product:', error);
        window.location.href = link.href;
      } finally {
        this.swappingProduct = false;
      }
    }

    async handleSubmit() {
      const overlay = this.modal.querySelector('[data-overlay]');
      overlay.click();
      Woolman.ModalsAndDrawers.closeModalOrDrawer(this.targetModalId);

      // Clean up the modal after a short delay to allow the modal to close
      setTimeout(() => {
        this.cleanupModal();
      }, 300);
    }

    cleanupModal() {
      if (this.modal && this.modal.parentNode) {
        // Remove event listeners before removing the element
        const closeButton = this.modal.querySelector('[data-close]');
        if (closeButton) {
          closeButton.removeEventListener('click', Woolman.ModalsAndDrawers.closeModalOrDrawerOrDrawerFromEvent);
        }

        const overlay = this.modal.querySelector('[data-overlay]');
        if (overlay) {
          overlay.removeEventListener('click', Woolman.ModalsAndDrawers.closeModalOrDrawerOrDrawerFromEvent);
        }

        if (this.productForm) {
          this.productForm.removeEventListener('submit', this.boundHandleSubmit);
          this.productForm = null;
        }

        this.modal.remove();
        this.modal = null;
      }
    }
  })
}

if (customElements.get('quick-add') === undefined) {

  customElements.define('quick-add', class QuickAdd extends HTMLElement {
    constructor() {
      'use strict';
      super();

      this.button = this.querySelector('button');
      this.variantId = this.dataset.variantId;
      this.productId = this.dataset.productId;
      this.productImage = this.dataset.productImage || null;
      this.cartNotification = document.getElementById('cart-notification');
      this.cartNotificationItem = document.getElementById('cart-notification-item');

      if (!this.button) {
        console.error('Quick add button not found');
        return;
      }

      if (!this.variantId) {
        console.warn('No variant ID found on the quick-add element');
        return;
      }

      this.button.addEventListener('click', this.quickAddToCart.bind(this));
    }

    async quickAddToCart(event) {
      event.preventDefault();

      if (!this.variantId) {
        console.warn('No variant ID found on the add to cart button');
        return;
      }

      const rootUrl = window.routes.root == '/' ? '/' : window.routes.root + '/';
      const formData = {
        'items': [{
          'id': this.variantId,
          'quantity': 1
        }]
      };

      this.button.setAttribute('disabled', true);
      this.button.classList.add('loading');
      this.button.querySelector('.loading-overlay')?.classList.remove('hidden');


      try {
        const response = await fetch(rootUrl + 'cart/add.js', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(formData)
        });

        const json = await response.json();

        if (!response.ok) {
          const errorMessage = typeof json.description === 'string' ? json.description : json.message;
          console.error('Error adding to cart:', errorMessage);
          throw new Error(`Network response was not ok: ${errorMessage}`);
        }

        if (this.cartNotification) {
          // Track previously focused element for accessibility
          const activeElement = document.activeElement;
          const insideQuickBuy = activeElement && activeElement.closest('.drawer--quick-buy');
          const fallbackFocusTarget = document.querySelector('#MainContent') || document.body;
          this.previouslyFocusedElement = insideQuickBuy ? fallbackFocusTarget : activeElement;

          // Extract cart item from response
          const cartItem = json.items && json.items.length > 0 ? json.items[0] : json;
          this.showCartNotification(cartItem, this.productImage);
        }

        const productAddedEvent = new CustomEvent('ajaxProduct:added', {
          detail: { productId: this.productId }
        });
        document.dispatchEvent(productAddedEvent);
      } catch (error) {
        console.error('Error adding product to cart:', error);
      } finally {
          this.button.classList.remove('loading');
          this.button.querySelector('.loading-overlay')?.classList.add('hidden');
        this.button.removeAttribute('disabled');
      }
    }

    isShopifyCdnUrl(urlString) {
      if (!urlString || typeof urlString !== 'string') return false;

      try {
        const url = new URL(urlString, window.location.origin);
        const allowedHosts = ['cdn.shopify.com'];
        return allowedHosts.includes(url.hostname);
      } catch (e) {
        return false;
      }
    }

    createNotificationItem(product, fallbackImage = null) {
      if (!this.cartNotificationItem) {
        console.warn('Cart notification item template not found');
        return null;
      }

      const notificationItemTemplate = document.importNode(this.cartNotificationItem.content, true);

      // Handle image - use product.image from cart response, or fallback to card image
      let imageUrl = product.image || fallbackImage;

      if (imageUrl) {
        if (product.image && imageUrl === product.image) {
          if (this.isShopifyCdnUrl(imageUrl)) {
            if (!imageUrl.match(/_\d+x\d+\./)) {
              const filename = imageUrl.split('/').pop();
              const lastDotIndex = filename.lastIndexOf('.');
              if (lastDotIndex > 0) {
                const newFilename = `${filename.substring(0, lastDotIndex)}_120x${filename.substring(lastDotIndex)}`;
                imageUrl = imageUrl.replace(filename, newFilename);
              }
            } else if (!imageUrl.includes('_120x.')) {
              // Has size suffix but not 120x - replace with 120x
              imageUrl = imageUrl.replace(/_\d+x\d+\./, '_120x.');
            }
          }
        }

        notificationItemTemplate.querySelector('.notification-item-image').setAttribute('src', imageUrl);
        notificationItemTemplate.querySelector('.notification-item-image').classList.remove('hide');
      } else {
        notificationItemTemplate.querySelector('.notification-item-image').classList.add('hide');
      }

      // Set product title
      notificationItemTemplate.querySelector('.notification-item-title').textContent = product.product_title || '';

      // Handle options_with_values if they exist (only show if product has multiple variants)
      if (!product.product_has_only_default_variant && 
          product.options_with_values && 
          Array.isArray(product.options_with_values) && 
          product.options_with_values.length > 0) {
        product.options_with_values.forEach(item => {
          const row = document.createElement("dl");
          const nameCell = document.createElement("dt");
          const valueCell = document.createElement("dd");

          nameCell.textContent = item.name + ': ';
          valueCell.textContent = item.value;

          row.appendChild(nameCell);
          row.appendChild(valueCell);
          notificationItemTemplate.querySelector('.notification-item-details').appendChild(row);
        });
      }

      // Handle properties if they exist
      if (product.properties && typeof product.properties === 'object') {
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
      }

      return notificationItemTemplate;
    }

    showCartNotification(cartJson, fallbackImage = null) {
      if (!this.cartNotification || !this.cartNotificationItem) return;

      const notificationTemplate = document.importNode(this.cartNotification.content, true);

      // Set notification title
      notificationTemplate.querySelector('[data-notification-title]').textContent = window.variantStrings.itemAdded;

      // Create and append notification item
      const singleItem = this.createNotificationItem(cartJson, fallbackImage);
      if (singleItem) {
        notificationTemplate.querySelector('[data-items]').appendChild(singleItem);
      }

      // Remove existing notification if present
      if (document.querySelector('.cart-notification')) {
        document.querySelector('.cart-notification').remove();
      }

      // Append to document body
      document.body.appendChild(notificationTemplate);

      const the_notification = document.querySelector('.cart-notification');

      // Set focus to the notification for accessibility
      the_notification.setAttribute('tabindex', '-1');
      the_notification.focus();

      // Add close button event listener
      the_notification.querySelector('.notification-close').addEventListener('click', () => {
        the_notification.classList.remove('anim-in');
        // Restore focus to previously focused element for accessibility
        if (this.previouslyFocusedElement && this.previouslyFocusedElement.focus) {
          this.previouslyFocusedElement.focus();
        }
      });
      
      setTimeout(() => {
        the_notification.classList.add('anim-in');
      }, 50);
    }
  });

}