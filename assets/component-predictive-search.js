class PredictiveSearch extends HTMLElement {
  constructor() {
    super();
    this.cachedResults = {};
    this.form = this.querySelector('form');
    this.input = this.querySelector('input[type="search"]');
    this.resetButton = this.querySelector('button[type="reset"]');
    this.predictiveSearchResults = this.querySelector('[data-predictive-search]');
    this.allPredictiveSearchInstances =
      document.querySelectorAll('predictive-search');
    this.isOpen = false;
    this.abortController = new AbortController();
    this.searchTerm = '';

    if (!this.input || !this.form) return;

    this.form.addEventListener('reset', this.onFormReset.bind(this));
    this.form.addEventListener('submit', this.onFormSubmit.bind(this));
    this.input.addEventListener(
      'input',
      debounce(() => this.onChange(), 300)
    );
    this.input.addEventListener('focus', this.onFocus.bind(this));
    this.input.addEventListener('keydown', this.onInputKeydown.bind(this));

    if (this.input.value !== '') {
      this.onFocus();
    }
  }

  getQuery() {
    return this.input.value.trim();
  }

  onChange() {
    this.toggleResetButton();

    const newSearchTerm = this.getQuery();
    if (!this.searchTerm || !newSearchTerm.startsWith(this.searchTerm)) {
      this.querySelector('#predictive-search-results-groups-wrapper')?.remove();
    }

    this.searchTerm = newSearchTerm;

    if (!this.searchTerm.length) {
      this.close(true);
      return;
    }

    this.getSearchResults(this.searchTerm);
  }

  onFormSubmit(event) {
    if (!this.getQuery().length) event.preventDefault();
  }

  onFormReset(event) {
    event.preventDefault();

    this.input.value = '';
    this.input.focus();
    this.toggleResetButton();
    this.searchTerm = '';
    this.abortController.abort();
    this.abortController = new AbortController();
    this.closeResults(true);
  }

  onFocus() {
    const currentSearchTerm = this.getQuery();

    if (!currentSearchTerm.length) return;

    if (this.searchTerm !== currentSearchTerm) {
      this.onChange();
    } else if (this.getAttribute('results') === 'true') {
      this.open();
    } else {
      this.getSearchResults(this.searchTerm);
    }
  }

  onInputKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close(true);
    }
  }

  getSearchResults(searchTerm) {
    const queryKey = searchTerm.replace(' ', '-').toLowerCase();
    this.setLiveRegionLoadingState();

    if (this.cachedResults[queryKey]) {
      this.renderSearchResults(this.cachedResults[queryKey]);
      return;
    }

    fetch(
      `${routes.predictive_search_url}?q=${encodeURIComponent(
        searchTerm
      )}&section_id=predictive-search`,
      { signal: this.abortController.signal }
    )
      .then((response) => {
        if (!response.ok) {
          const error = new Error(response.status);
          this.close();
          throw error;
        }

        return response.text();
      })
      .then((text) => {
        const resultsMarkup = new DOMParser()
          .parseFromString(text, 'text/html')
          .querySelector('#shopify-section-predictive-search').innerHTML;
        this.allPredictiveSearchInstances.forEach((predictiveSearchInstance) => {
          predictiveSearchInstance.cachedResults[queryKey] = resultsMarkup;
        });
        this.renderSearchResults(resultsMarkup);
      })
      .catch((error) => {
        if (error?.code === 20) {
          return;
        }
        this.close();
        throw error;
      });
  }

  setLiveRegionLoadingState() {
    this.statusElement =
      this.statusElement || this.querySelector('.predictive-search-status');
    this.loadingText =
      this.loadingText || this.getAttribute('data-loading-text');

    if (!this.predictiveSearchResults) return;

    this.predictiveSearchResults.removeAttribute('hidden');
    this.restoreLoadingMarkup();
    this.predictiveSearchResults.setAttribute('aria-busy', 'true');
    this.setLiveRegionText(this.loadingText);
    this.setAttribute('loading', true);
  }

  setLiveRegionText(statusText) {
    if (!this.statusElement || !statusText) return;
    this.statusElement.textContent = statusText;
  }

  refreshParentFocusTrap() {
    Woolman.Utils.refreshTrapFocus?.();
  }

  restoreLoadingMarkup() {
    this.predictiveSearchResults.innerHTML = `
      <div class="predictive-search__loading-state">
        <svg aria-hidden="true" focusable="false" class="spinner" viewBox="0 0 66 66" xmlns="http://www.w3.org/2000/svg">
          <circle class="path" fill="none" stroke-width="6" cx="33" cy="33" r="30"></circle>
        </svg>
      </div>
    `;
  }

  renderSearchResults(resultsMarkup) {
    this.predictiveSearchResults.innerHTML = resultsMarkup;
    this.setAttribute('results', true);

    this.setLiveRegionResults();
    this.open();
    this.refreshParentFocusTrap();
  }

  setLiveRegionResults() {
    this.removeAttribute('loading');
    this.predictiveSearchResults.removeAttribute('aria-busy');
    const countElement = this.querySelector(
      '[data-predictive-search-live-region-count-value]'
    );
    if (countElement) {
      this.setLiveRegionText(countElement.textContent);
    }
  }

  open() {
    this.setAttribute('open', true);
    this.input.setAttribute('aria-expanded', 'true');
    this.predictiveSearchResults.removeAttribute('hidden');
    this.isOpen = true;
  }

  close(clearSearchTerm = false) {
    this.closeResults(clearSearchTerm);
    this.isOpen = false;
  }

  closeResults(clearSearchTerm = false) {
    if (clearSearchTerm) {
      this.input.value = '';
      this.removeAttribute('results');
      this.restoreLoadingMarkup();
    }

    this.removeAttribute('loading');
    this.removeAttribute('open');
    this.input.setAttribute('aria-expanded', 'false');
    this.predictiveSearchResults.removeAttribute('aria-busy');
    this.predictiveSearchResults.setAttribute('hidden', '');
    this.predictiveSearchResults.removeAttribute('style');
    this.refreshParentFocusTrap();
  }

  toggleResetButton() {
    const resetIsHidden = this.resetButton.classList.contains('hidden');

    if (this.input.value.length > 0 && resetIsHidden) {
      this.resetButton.classList.remove('hidden');
    } else if (this.input.value.length === 0 && !resetIsHidden) {
      this.resetButton.classList.add('hidden');
    }
  }
}

customElements.define('predictive-search', PredictiveSearch);
