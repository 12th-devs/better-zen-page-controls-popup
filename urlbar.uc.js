// ==UserScript==
// @name           URLBarModifier
// @ignorecache
// @description   Enhanced URL bar with page controls panel including extensions, and sharing functionality
// ==/UserScript==

console.log("URLBarModifier: Initializing...");

// ============================================================================
// CONSTANTS AND CONFIGURATION
// ============================================================================

const CONFIG = {
  PANEL_ID: "page-controls-panel",
  BUTTON_ID: "page-controls-button",
  CONTAINER_ID: "page-action-buttons",
  EXTENSIONS_URL: "https://addons.mozilla.org/en-US/firefox/extensions/",
  FALLBACK_ICON: "chrome://mozapps/skin/extensions/extension.svg",
  ICON_SIZE: "16px",
  ICON_MARGIN: "2px"
};

const SELECTORS = {
  MAIN_POPUP_SET: "#mainPopupSet",
  PAGE_ACTION_BUTTONS: "#page-action-buttons",
  PANEL: "#page-controls-panel",
  BUTTON: "#page-controls-button",
  SHARE_BUTTON: "#share-url-button",
  ADD_EXTENSION_BUTTON: "#add-extension-button",
  EXTENSION_CONTAINER: "#extension-container"
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Helper function to append XUL or HTML elements to a parent element
 * @param {Element} parentElement - The parent element to append to
 * @param {string} xulString - The XUL or HTML string to parse
 * @param {Element|null} insertBefore - Element to insert before (optional)
 * @param {boolean} isXUL - Whether the string is XUL (true) or HTML (false)
 * @returns {Element} The appended element
 */
const appendXUL = (parentElement, xulString, insertBefore = null, isXUL = false) => {
  let element;
  
  if (isXUL) {
    element = window.MozXULElement.parseXULToFragment(xulString);
  } else {
    element = new DOMParser().parseFromString(xulString, "text/html");
    element = element.body.children.length 
      ? element.body.firstChild 
      : element.head.firstChild;
  }

  element = parentElement.ownerDocument.importNode(element, true);

  if (insertBefore) {
    parentElement.insertBefore(element, insertBefore);
  } else {
    parentElement.appendChild(element);
  }

  return element;
};

/**
 * Logs a message with consistent formatting
 * @param {string} component - The component name
 * @param {string} message - The message to log
 * @param {...any} args - Additional arguments to log
 */
const log = (component, message, ...args) => {
  console.log(`${component}: ${message}`, ...args);
};

/**
 * Logs an error with consistent formatting
 * @param {string} component - The component name
 * @param {string} message - The error message
 * @param {Error} error - The error object
 */
const logError = (component, message, error) => {
  console.error(`${component}: ${message}`, error);
};

// ============================================================================
// PANEL MANAGER CLASS
// ============================================================================

/**
 * Manages the page controls panel with extensions, and sharing functionality
 */
class PanelManager {
  constructor() {
    this.panel = null;
    this.isOpen = false;
    this.button = null;
    this.extensionData = new Map();
    this.addonListener = null;
    this.extrasMenuListenersSetup = false;
    this.extensionMenuListenersSetup = false;
    this.currentContextMenu = null;
    this.currentContextMenuExtensionId = null;
    this.boundOnGlobalPointerDown = null;
    this.boundOnGlobalKeyDown = null;
    this.lastAnchorButton = null;
    this.screenshotCommandId = null;
  }

  // ============================================================================
  // PANEL CREATION AND MANAGEMENT
  // ============================================================================

  /**
   * Creates the main panel with all sections
   */
  createPanel() {
    this.removeExistingPanel();
    this.createContextMenu();
    
    const panelXUL = this.generatePanelXUL();
    const mainPopupSet = document.querySelector(SELECTORS.MAIN_POPUP_SET);
    
    if (!mainPopupSet) {
      logError("PanelManager", "mainPopupSet not found");
      return;
    }

    appendXUL(mainPopupSet, panelXUL, null, true);
    this.panel = document.querySelector(SELECTORS.PANEL);
    this.setupPanelEventListeners();
    
    log("PanelManager", "Panel created and added to mainPopupSet");
  }

  /**
   * Removes existing panel if it exists
   */
  removeExistingPanel() {
    const existingPanel = document.querySelector(SELECTORS.PANEL);
    if (existingPanel) {
      existingPanel.remove();
    }
  }

  /**
   * Creates the context menu for extras function
   */
  createContextMenu() {
    // Remove existing context menu if it exists
    const existingMenu = document.querySelector("#extras-context-menu");
    if (existingMenu) {
      existingMenu.remove();
    }

    const contextMenuXUL = `
      <menupopup id="extras-context-menu">
        <menuitem id="clear-cache-button" label="Clear Cache"/>
        <menuitem id="clear-cookies-button" label="Clear Cookies"/>
        <menuseparator/>
        <menuitem id="manage-extensions-button" label="Manage Extensions"/>
        <menuseparator/>
        <menuitem id="page-permissions-button" label="All Page Permissions"/>
      </menupopup>
    `;

    const mainPopupSet = document.querySelector(SELECTORS.MAIN_POPUP_SET);
    if (mainPopupSet) {
      appendXUL(mainPopupSet, contextMenuXUL, null, true);
      log("PanelManager", "Context menu created and added to mainPopupSet");
    }
  }

  /**
   * Generates the XUL markup for the panel
   * @returns {string} The XUL markup
   */
  generatePanelXUL() {
    return `
      <panel id="${CONFIG.PANEL_ID}" type="arrow" noautofocus="true" noautohide="true">
        <div id="page-controls-panel-content">
            <div id="share-url-section" class="page-controls-panel-section">
                <div id="share-url-button">
                    <image id="share-url-image" class="urlbar-icon"></image>
                    <label value="Share URL"/>
                </div>
            </div>
            <menuseparator/>
            <div id="page-controls-section" class="page-controls-panel-section">
                <div id="page-controls-container">
                    <image id="screenshot-button" class="urlbar-icon" tooltiptext="Screenshot"></image>
                    <image id="devtools-button" class="urlbar-icon" tooltiptext="DevTools"></image>
                    <image id="copy-link-button" class="urlbar-icon" tooltiptext="Copy Link"></image>
                    <image id="reader-button" class="urlbar-icon" tooltiptext="Reader Mode"></image>
                </div>        
            </div>
            <menuseparator/>
            <div id="extension-section" class="page-controls-panel-section">
                <label value="Extensions" class="page-controls-panel-section-label"/>
                <div id="extension-container">
                    <image id="add-extension-button" class="urlbar-icon" tooltiptext="Open Extension Store"></image>
                </div>        
            </div>
            <menuseparator/>
            <div id="extras-section" class="page-controls-panel-section">
                <div id="extras-container">
                    <div id="page-secutity-status">
                        <image id="page-secutity-status-image" class="urlbar-icon"></image>
                        <label id="page-secutity-status-label"></label>
                    </div>
                    <image id="extras-function" class="urlbar-icon"></image>
                </div>        
            </div>
        </div>
      </panel>
    `;
  }

  /**
   * Sets up event listeners for panel elements
   */
  setupPanelEventListeners() {
    const shareButton = document.querySelector(SELECTORS.SHARE_BUTTON);
      if (shareButton) {
        shareButton.addEventListener("click", (event) => {
        this.shareCurrentUrl(event);
        });
      }

    const addExtensionButton = document.querySelector(SELECTORS.ADD_EXTENSION_BUTTON);
      if (addExtensionButton) {
        addExtensionButton.addEventListener("click", (event) => {
        this.openExtensionsPage(event);
        });
      }

    const extrasFunction = document.querySelector("#extras-function");
    if (extrasFunction) {
      extrasFunction.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.showExtrasContextMenu(event);
      });
    }

    const screenshotButton = document.querySelector("#screenshot-button");
    if (screenshotButton) {
      screenshotButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.triggerScreenshotTool();
      });
    }

    const devtoolsButton = document.querySelector("#devtools-button");
    if (devtoolsButton) {
      devtoolsButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.triggerDeveloperTools();
      });
    }

    const copyLinkButton = document.getElementById("copy-link-button");
    if (copyLinkButton) {
      copyLinkButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        try {
          if (window.ZenCommandPalette && typeof window.ZenCommandPalette.executeCommandByKey === "function") {
            window.ZenCommandPalette.executeCommandByKey("cmd_zenCopyCurrentURL");
          } else {
            const cmd = document.getElementById("cmd_zenCopyCurrentURL");
            if (cmd && typeof cmd.doCommand === "function") {
              cmd.doCommand();
            }
          }
        } catch (_) {}
        this.hidePanel();
      });
    }

    const readerButton = document.getElementById("reader-button");
    if (readerButton) {
      readerButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.triggerReaderMode();
      });
    }
  }

  /**
   * Shows the panel for the given target button
   * @param {Element} targetButton - The button that triggered the panel
   */
  showPanel(targetButton) {
    if (!this.panel) {
      this.createPanel();
    }

    if (this.panel && targetButton) {
      this.setupAddonListenerIfNeeded();
      this.loadExtensions();
      this.updateSecurityStatus();
      this.panel.openPopup(targetButton, "after_start", 0, 0, false, false);
      this.isOpen = true;
      this.lastAnchorButton = targetButton;
      this.addPanelGlobalHandlers();
      log("PanelManager", "Panel opened");
    }
  }

  /**
   * Hides the panel
   */
  hidePanel() {
    if (this.panel && this.isOpen) {
      this.panel.hidePopup();
      this.isOpen = false;
      this.removePanelGlobalHandlers();
      log("PanelManager", "Panel closed");
    }
  }

  /**
   * Registers global handlers to close the panel on outside click or Escape
   */
  addPanelGlobalHandlers() {
    if (this.boundOnGlobalPointerDown || this.boundOnGlobalKeyDown) return;

    this.boundOnGlobalPointerDown = (event) => {
      try {
        if (!this.panel || !this.isOpen) return;
        const target = event.target;
        const clickInsidePanel = this.panel.contains(target);
        const clickOnAnchor = this.lastAnchorButton && this.lastAnchorButton.contains && this.lastAnchorButton.contains(target);
        if (!clickInsidePanel && !clickOnAnchor) {
          this.hidePanel();
        }
      } catch (_) {}
    };

    this.boundOnGlobalKeyDown = (event) => {
      if (!this.panel || !this.isOpen) return;
      if (event.key === "Escape") {
        event.stopPropagation();
        this.hidePanel();
      }
    };

    // Capture phase to intercept before panel handles
    window.addEventListener("pointerdown", this.boundOnGlobalPointerDown, true);
    window.addEventListener("keydown", this.boundOnGlobalKeyDown, true);
  }

  /**
   * Removes the global close handlers
   */
  removePanelGlobalHandlers() {
    if (this.boundOnGlobalPointerDown) {
      window.removeEventListener("pointerdown", this.boundOnGlobalPointerDown, true);
      this.boundOnGlobalPointerDown = null;
    }
    if (this.boundOnGlobalKeyDown) {
      window.removeEventListener("keydown", this.boundOnGlobalKeyDown, true);
      this.boundOnGlobalKeyDown = null;
    }
  }

  /**
   * Toggles the panel visibility
   * @param {Element} targetButton - The button that triggered the toggle
   */
  togglePanel(targetButton) {
    this.isOpen ? this.hidePanel() : this.showPanel(targetButton);
  }

  // ============================================================================
  // SECURITY STATUS FUNCTIONALITY
  // ============================================================================

  /**
   * Updates the security status icon based on the current page's security state
   */
  updateSecurityStatus() {
    try {
      const securityImage = document.querySelector("#page-secutity-status-image");
      
      if (!securityImage) {
        log("PanelManager", "Security status image not found");
        return;
      }

      // Get the identity permission box to check for security indicators
      const identityPermissionBox = document.getElementById("identity-permission-box");
      if (!identityPermissionBox) {
        log("PanelManager", "Identity permission box not found");
        return;
      }

      // Check for sharing indicators first (active permissions)
      const hasSharingIcon = identityPermissionBox.hasAttribute("hasSharingIcon");
      const hasPermissions = identityPermissionBox.hasAttribute("hasPermissions");
      
      // Determine the appropriate icon based on the identity box state
      let iconSrc = "chrome://browser/skin/zen-icons/info.svg"; // Default
      
      if (hasSharingIcon) {
        // Active sharing (camera, microphone, location, etc.)
        iconSrc = "chrome://browser/skin/zen-icons/shield-check.svg";
      } else if (hasPermissions) {
        // Has blocked permissions or other permission indicators
        iconSrc = "chrome://browser/skin/zen-icons/shield-exclamation.svg";
      } else {
        // Check for HTTPS/security state
        const uri = gBrowser.currentURI;
        if (uri && uri.scheme === "https") {
          iconSrc = "chrome://browser/skin/zen-icons/security.svg";
        } else if (uri && uri.scheme === "http") {
          iconSrc = "chrome://browser/skin/zen-icons/lock-open.svg";
        }
      }
      
      // Update the icon
      securityImage.setAttribute("src", iconSrc);
      
      log("PanelManager", `Security status updated with icon: ${iconSrc}`);
    } catch (error) {
      logError("PanelManager", "Error updating security status", error);
    }
  }

  // ============================================================================
  // SHARING FUNCTIONALITY
  // ============================================================================

  /**
   * Triggers the browser's built-in screenshot tool, mirroring the toolbar button
   */
  triggerScreenshotTool() {
    const command = 'Browser:Screenshot'
    const commandEl = document.getElementById(command)
    if (commandEl && commandEl.doCommand) {
      commandEl.doCommand()
    }
  }

  /**
   * Triggers Reader View using the native browser command
   */
  triggerReaderMode() {
    try {
      const command = 'View:ReaderView';
      const commandEl = document.getElementById(command);
      if (commandEl && typeof commandEl.doCommand === 'function') {
        commandEl.doCommand();
      }
    } catch (error) {
      logError("PanelManager", "Error triggering reader mode", error);
    }
    this.hidePanel();
  }

  /**
   * Triggers the browser's built-in Developer Tools, mirroring the toolbar button
   */
  triggerDeveloperTools() {
    try {
      // Primary: open the Hamburger menu, then the Developer Tools subview via PanelUI
      try {
        if (typeof PanelUI !== 'undefined' && typeof PanelUI.showSubView === 'function') {
          const viewId = 'PanelUI-developer-tools';
          // Ensure the developer toggle is created so the subview exists
          try {
            const startup = Cc['@mozilla.org/devtools/startup-clh;1']?.getService()?.wrappedJSObject;
            if (startup && typeof startup.hookDeveloperToggle === 'function') {
              startup.hookDeveloperToggle();
            }
          } catch (_) {}

          const anchor = document.getElementById('page-controls-button');

          // Directly show the Developer Tools subview without opening the main menu
          PanelUI.showSubView(viewId, anchor);
          this.hidePanel();
          return;
        }
      } catch (e) {
        logError("PanelManager", "DevTools: PanelUI subview open failed", e);
      }

      // Fallback: invoke the real toolbarbutton if available
      const toolbarBtn = [...document.querySelectorAll('#developer-button')]
        .find(el => el && (el.localName === 'toolbarbutton' || el.tagName === 'toolbarbutton'));
      if (!toolbarBtn) {
        log("PanelManager", "DevTools: toolbarbutton not found");
      } else if (typeof toolbarBtn.doCommand === 'function') {
        log("PanelManager", "DevTools: invoking via toolbarbutton.doCommand()");
        toolbarBtn.doCommand();
        this.hidePanel();
        return;
      } else if (typeof toolbarBtn.click === 'function') {
        log("PanelManager", "DevTools: invoking via toolbarbutton.click()");
        toolbarBtn.click();
        this.hidePanel();
        return;
      } else {
        log("PanelManager", "DevTools: toolbarbutton present but not invocable");
      }
    } catch (error) {
      logError("PanelManager", "Error triggering Developer Tools", error);
    }
    this.hidePanel();
  }

  /**
   * Shares the current URL using the zen sharing service
   * @param {Event} event - The click event
   */
  shareCurrentUrl(event) {
    const currentUrl = gBrowser.currentURI.spec;
    
    if (!this.isValidUrl(currentUrl)) {
      log("PanelManager", "Invalid URL for sharing:", currentUrl);
      return;
    }

      const buttonRect = event.target.getBoundingClientRect();
      Services.zen.share(
        Services.io.newURI(currentUrl),
        "",
        "",
        buttonRect.left,
        window.innerHeight - buttonRect.bottom,
        buttonRect.width,
        buttonRect.height
      );
    
    this.hidePanel();
  }

  /**
   * Validates if a URL is shareable
   * @param {string} url - The URL to validate
   * @returns {boolean} True if valid, false otherwise
   */
  isValidUrl(url) {
    return url && (url.startsWith("http://") || url.startsWith("https://"));
  }


  // ============================================================================
  // EXTENSIONS FUNCTIONALITY
  // ============================================================================

  /**
   * Opens the Firefox extensions page
   * @param {Event} event - The click event
   */
  openExtensionsPage(event) {
    if (typeof UC_API !== "undefined" && UC_API.Utils && UC_API.Utils.loadURI) {
      UC_API.Utils.loadURI(window, {
        url: CONFIG.EXTENSIONS_URL,
        where: "tab",
      });
    }
    this.hidePanel();
  }

  /**
   * Sets up the AddonManager listener to detect extension changes
   */
  setupAddonListener() {
    log("PanelManager", "Setting up AddonManager listener");
    
    this.addonListener = {
      onEnabled: (addon) => {
        log("PanelManager", `Extension enabled: ${addon.name}`);
        this.refreshExtensions();
      },
      onDisabled: (addon) => {
        log("PanelManager", `Extension disabled: ${addon.name}`);
        this.refreshExtensions();
      },
      onInstalled: (addon) => {
        log("PanelManager", `Extension installed: ${addon.name}`);
        this.refreshExtensions();
      },
      onUninstalled: (addon) => {
        log("PanelManager", `Extension uninstalled: ${addon.name}`);
        this.refreshExtensions();
      }
    };

    AddonManager.addAddonListener(this.addonListener);
    log("PanelManager", "AddonManager listener added");
  }

  /**
   * Sets up addon listener if not already set up
   */
  setupAddonListenerIfNeeded() {
    if (!this.addonListener) {
      this.setupAddonListener();
    }
  }

  /**
   * Refreshes the extensions list (called when extensions change)
   */
  refreshExtensions() {
    if (this.isOpen) {
      log("PanelManager", "Refreshing extensions due to change");
      this.loadExtensions();
    }
  }

  /**
   * Loads and displays all user extensions
   */
  async loadExtensions() {
    log("PanelManager", "Starting extension loading process");

    try {
      const addons = await AddonManager.getAddonsByTypes(["extension"]);
      const userExtensions = addons.filter((a) => !a?.isSystem);

      log("PanelManager", `Found ${userExtensions.length} user extensions`);

      const container = document.querySelector(SELECTORS.EXTENSION_CONTAINER);
      if (!container) {
        log("PanelManager", "Extension container not found");
        return;
      }

      this.processExtensions(container, userExtensions);
      log("PanelManager", "Extension loading completed successfully");
    } catch (error) {
      logError("PanelManager", "Error in loadExtensions", error);
    }
  }

  /**
   * Processes extensions and updates the container
   * @param {Element} container - The container element
   * @param {Array} userExtensions - Array of user extensions
   */
  processExtensions(container, userExtensions) {
    const existingExtensionIds = this.getExistingExtensionIds(container);
      this.extensionData = new Map();

      // Process each extension
      for (const addon of userExtensions) {
        const extensionId = addon.id;
        const existingWrapper = container.querySelector(`[data-extension-id="${extensionId}"]`);
        
        if (existingWrapper) {
          this.updateExistingExtension(existingWrapper, addon);
        } else {
          this.addNewExtension(container, addon);
        }
        
        this.extensionData.set(extensionId, {
          id: addon.id,
          name: addon.name,
          iconURL: addon.iconURL
        });
      }

    // Remove uninstalled extensions
    this.removeUninstalledExtensions(container, userExtensions);
  }

  /**
   * Gets existing extension IDs from the container
   * @param {Element} container - The container element
   * @returns {Set} Set of existing extension IDs
   */
  getExistingExtensionIds(container) {
    const existingExtensionIds = new Set();
    [...container.querySelectorAll("[data-extension-id]")].forEach(el => {
      const id = el.getAttribute("data-extension-id");
      if (id) {
        existingExtensionIds.add(id);
      }
    });
    return existingExtensionIds;
  }

  /**
   * Removes extensions that are no longer installed
   * @param {Element} container - The container element
   * @param {Array} userExtensions - Array of current user extensions
   */
  removeUninstalledExtensions(container, userExtensions) {
      const currentExtensionIds = new Set(userExtensions.map(a => a.id));
      [...container.querySelectorAll("[data-extension-id]")].forEach(el => {
        const id = el.getAttribute("data-extension-id");
        if (id && !currentExtensionIds.has(id)) {
        log("PanelManager", `Removing uninstalled extension ${id}`);
          el.remove();
        }
      });
  }

  /**
   * Updates an existing extension element
   * @param {Element} wrapper - The existing wrapper element
   * @param {Object} addon - The addon data
   */
  updateExistingExtension(wrapper, addon) {
    const img = wrapper.querySelector('.extension-icon');
    if (img) {
      img.setAttribute('enabled', addon.isActive.toString());
      img.setAttribute('tooltiptext', this.getExtensionTooltip(addon));
      
      const iconSrc = this.getExtensionIconSrc(addon);
      if (img.getAttribute('src') !== iconSrc) {
        img.setAttribute('src', iconSrc);
      }
    }
  }

  /**
   * Adds a new extension element
   * @param {Element} container - The container element
   * @param {Object} addon - The addon data
   */
  addNewExtension(container, addon) {
    try {
      const wrapper = this.createExtensionWrapper(addon);
      const img = this.createExtensionImage(addon);
      
      wrapper.appendChild(img);
      this.setupExtensionClickHandler(wrapper, addon.id);
      container.insertBefore(wrapper, container.firstChild);
      
      this.setupImageEventListeners(img, addon.name);
    } catch (error) {
      logError("PanelManager", "Failed to add extension icon", error);
    }
  }

  /**
   * Creates a wrapper element for an extension
   * @param {Object} addon - The addon data
   * @returns {Element} The wrapper element
   */
  createExtensionWrapper(addon) {
      const wrapper = document.createElement("div");
      wrapper.className = "urlbar-icon extension-wrapper";
      wrapper.setAttribute("data-extension-id", addon.id);
    return wrapper;
  }

  /**
   * Creates an image element for an extension
   * @param {Object} addon - The addon data
   * @returns {Element} The image element
   */
  createExtensionImage(addon) {
      const img = document.createXULElement("image");
      img.className = "extension-icon";
    img.setAttribute("src", this.getExtensionIconSrc(addon));
      img.setAttribute("tooltiptext", this.getExtensionTooltip(addon));
      img.setAttribute("enabled", addon.isActive.toString());
    img.setAttribute("style", `width: ${CONFIG.ICON_SIZE}; height: ${CONFIG.ICON_SIZE}; margin: ${CONFIG.ICON_MARGIN};`);
    return img;
  }

  /**
   * Gets the appropriate icon source for an extension
   * @param {Object} addon - The addon data
   * @returns {string} The icon source URL
   */
  getExtensionIconSrc(addon) {
    return addon.iconURL && typeof addon.iconURL === "string"
      ? addon.iconURL
      : CONFIG.FALLBACK_ICON;
  }

  /**
   * Sets up click handler for extension wrapper
   * @param {Element} wrapper - The wrapper element
   * @param {string} extensionId - The extension ID
   */
  setupExtensionClickHandler(wrapper, extensionId) {
    // Left click handler
    wrapper.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.openExtensionPopup(extensionId);
    });
    
    // Right click handler for context menu
    wrapper.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.showExtensionContextMenu(event, extensionId);
    });
  }

  /**
   * Sets up event listeners for extension image
   * @param {Element} img - The image element
   * @param {string} extensionName - The extension name
   */
  setupImageEventListeners(img, extensionName) {
      img.addEventListener("load", () => {
      log("PanelManager", `Image loaded successfully for ${extensionName}`);
    });

    img.addEventListener("error", () => {
      log("PanelManager", `Image failed to load for ${extensionName}, using fallback`);
      img.setAttribute("src", CONFIG.FALLBACK_ICON);
    });
  }

  /**
   * Gets the appropriate tooltip text for an extension
   * @param {Object} addon - The addon data
   * @returns {string} The tooltip text
   */
  getExtensionTooltip(addon) {
    const extensionName = addon.name || 'Extension';
    
    if (addon.isActive) {
      try {
        const policy = WebExtensionPolicy.getByID(addon.id);
        if (policy) {
          const action = gUnifiedExtensions.browserActionFor(policy);
          if (action) {
            return `Open ${extensionName}`;
          }
        }
      } catch (error) {
        // Fall through to enable/disable logic
      }
    }
    
    return addon.isActive ? `Disable ${extensionName}` : `Enable ${extensionName}`;
  }

  /**
   * Opens the popup for a specific extension
   * @param {string} extensionId - The ID of the extension to open popup for
   */
  async openExtensionPopup(extensionId) {
    try {
      log("PanelManager", `Opening popup for extension ${extensionId}`);
      
      const policy = WebExtensionPolicy.getByID(extensionId);
      
      if (!policy) {
        await this.toggleExtensionState(extensionId);
          return;
        }

      const action = gUnifiedExtensions.browserActionFor(policy);
      if (!action) {
        await this.toggleExtensionState(extensionId);
        return;
      }

      action.openPopup(window, true);
        this.hidePanel();
      
      log("PanelManager", `Successfully opened popup for extension ${extensionId}`);
    } catch (error) {
      logError("PanelManager", `Error opening popup for extension ${extensionId}`, error);
    }
  }

  /**
   * Toggles the enabled/disabled state of an extension
   * @param {string} extensionId - The extension ID
   */
  async toggleExtensionState(extensionId) {
        const addon = await AddonManager.getAddonByID(extensionId);
        if (!addon) {
      logError("PanelManager", `No addon found for extension ${extensionId}`);
          return;
        }

    const newState = addon.isActive ? await addon.disable() : await addon.enable();
    this.updateExtensionImageState(extensionId, !addon.isActive);
        this.hidePanel();
    
    log("PanelManager", `${addon.isActive ? 'Enabled' : 'Disabled'} extension ${extensionId}`);
  }

  /**
   * Updates the extension image state attribute
   * @param {string} extensionId - The ID of the extension
   * @param {boolean} isEnabled - Whether the extension is enabled
   */
  async updateExtensionImageState(extensionId, isEnabled) {
    const extensionWrapper = document.querySelector(`[data-extension-id="${extensionId}"]`);
    if (extensionWrapper) {
      const image = extensionWrapper.querySelector('.extension-icon');
      if (image) {
        image.setAttribute('enabled', isEnabled.toString());
        
        try {
          const addon = await AddonManager.getAddonByID(extensionId);
          if (addon) {
            const tempAddon = { ...addon, isActive: isEnabled };
            const tooltipText = this.getExtensionTooltip(tempAddon);
            image.setAttribute('tooltiptext', tooltipText);
          }
        } catch (error) {
          logError("PanelManager", `Error updating tooltip for extension ${extensionId}`, error);
        }
      }
    }
  }

  // ============================================================================
  // EXTENSION CONTEXT MENU
  // ============================================================================

  /**
   * Ensures the extensions menupopup exists under #mainPopupSet and returns it
   * @returns {Element|null}
   */
  ensureExtensionContextMenu() {
    const popupSet = document.querySelector(SELECTORS.MAIN_POPUP_SET);
    if (!popupSet) {
      logError("PanelManager", "#mainPopupSet not found for extension context menu", new Error("Missing mainPopupSet"));
      return null;
    }

    let menu = document.querySelector("#extension-context-menu");
    if (menu) {
      return menu;
    }

    const menuXUL = `
      <menupopup id="extension-context-menu">
        <menuitem id="ext-menu-pin" label="Pin to Toolbar"/>
        <menuseparator/>
        <menuitem id="ext-menu-manage" label="Manage Extension"/>
        <menuitem id="ext-menu-remove" label="Remove Extension"/>
        <menuitem id="ext-menu-report" label="Report Extension"/>
      </menupopup>
    `;

    appendXUL(popupSet, menuXUL, null, true);
    // appendXUL with XUL returns a DocumentFragment; query the actual node
    return document.querySelector("#extension-context-menu");
  }

  /**
   * One-time wiring for extension menu items
   */
  setupExtensionMenuListeners() {
    const menu = document.querySelector("#extension-context-menu");
    if (!menu) return;

    const pinItem = document.querySelector("#ext-menu-pin");
    if (pinItem) {
      pinItem.addEventListener("command", () => {
        if (this.currentContextMenuExtensionId) {
          this.pinExtensionToToolbar(this.currentContextMenuExtensionId);
        }
      });
    }

    const manageItem = document.querySelector("#ext-menu-manage");
    if (manageItem) {
      manageItem.addEventListener("command", async () => {
        if (this.currentContextMenuExtensionId) {
          await this.manageExtension(this.currentContextMenuExtensionId);
        }
      });
    }

    const removeItem = document.querySelector("#ext-menu-remove");
    if (removeItem) {
      removeItem.addEventListener("command", async () => {
        if (this.currentContextMenuExtensionId) {
          await this.removeExtension(this.currentContextMenuExtensionId);
        }
      });
    }

    const reportItem = document.querySelector("#ext-menu-report");
    if (reportItem) {
      reportItem.addEventListener("command", () => {
        if (this.currentContextMenuExtensionId) {
          this.reportExtension(this.currentContextMenuExtensionId);
        }
      });
    }

    this.extensionMenuListenersSetup = true;
  }

  /**
   * Shows context menu for extension
   * @param {Event} event - The context menu event
   * @param {string} extensionId - The extension ID
   */
  showExtensionContextMenu(event, extensionId) {
    try {
      const menu = this.ensureExtensionContextMenu();
      if (!menu) return;

      // Record which extension this menu is for
      this.currentContextMenuExtensionId = extensionId;

      if (!this.extensionMenuListenersSetup) {
        this.setupExtensionMenuListeners();
      }

      // Anchor to the wrapper for automatic positioning; fallback if needed
      const anchor = event.currentTarget || event.target;
      if (typeof menu.openPopup === "function") {
        menu.openPopup(anchor, "after_start", 0, 0, true, null, event);
      } else if (typeof menu.openPopupAtScreen === "function") {
        menu.openPopupAtScreen(event.screenX, event.screenY, true);
        log("PanelManager", `Context menu opened for extension ${extensionId} at screen position ${event.screenX}, ${event.screenY}`);
      }

      this.currentContextMenu = menu;
      log("PanelManager", `Context menu opened for extension ${extensionId}`);
    } catch (error) {
      logError("PanelManager", "Error showing extension context menu", error);
    }
  }

  /**
   * Gets extension information by ID
   * @param {string} extensionId - The extension ID
   * @returns {Object|null} Extension information or null if not found
   */
  getExtensionInfo(extensionId) {
    try {
      const addon = AddonManager.getAddonByID(extensionId);
      if (addon) {
        return {
          id: addon.id,
          name: addon.name,
          isActive: addon.isActive,
          iconURL: addon.iconURL
        };
      }
      return null;
    } catch (error) {
      logError("PanelManager", "Error getting extension info", error);
      return null;
    }
  }

  /**
   * Creates the extension context menu using XUL menupopup
   * @param {Object} addon - Extension information
   * @param {number} x - X position for menu
   * @param {number} y - Y position for menu
   * @returns {Element} The context menu element
   */
  // Deprecated: menu is now created once in ensureExtensionContextMenu()
  createExtensionContextMenu() { return this.ensureExtensionContextMenu(); }

  /**
   * Sets up click outside handler to close context menu
   */
  setupContextMenuCloseHandler() {}

  /**
   * Hides the extension context menu
   */
  hideExtensionContextMenu() {
    const menu = document.querySelector("#extension-context-menu");
    if (menu && typeof menu.hidePopup === "function") {
      menu.hidePopup();
    }
    this.currentContextMenu = null;
    this.currentContextMenuExtensionId = null;
  }

  /**
   * Pins extension to toolbar
   * @param {string} extensionId - The extension ID
   */
  pinExtensionToToolbar(extensionId) {
    try {
      log("PanelManager", `Pinning extension ${extensionId} to toolbar`);
      
      // Get the extension addon
      const addon = WebExtensionPolicy.getByID(extensionId);
      if (!addon) {
        log("PanelManager", `Extension ${extensionId} not found for pinning`);
        return;
      }
      
      // Try to pin the extension to the toolbar
      // This uses the unified extensions API
      try {
        const policy = WebExtensionPolicy.getByID(extensionId);
        const hasUnified = typeof gUnifiedExtensions !== "undefined" && gUnifiedExtensions;
        if (policy && hasUnified) {
          // Prefer a Unified Extensions API if present
          if (typeof gUnifiedExtensions.togglePinned === "function") {
            gUnifiedExtensions.togglePinned(policy);
            log("PanelManager", `Extension ${extensionId} pin state toggled via gUnifiedExtensions.togglePinned`);
          } else if (typeof gUnifiedExtensions.togglePinnedFor === "function") {
            gUnifiedExtensions.togglePinnedFor(policy);
            log("PanelManager", `Extension ${extensionId} pin state toggled via gUnifiedExtensions.togglePinnedFor`);
          } else {
            // Fallback: try action object methods if they exist
            const action = gUnifiedExtensions.browserActionFor(policy);
            if (action) {
              if (typeof action.setPinned === "function") {
                const pinned = !!(action.pinned);
                action.setPinned(!pinned);
                log("PanelManager", `Extension ${extensionId} pin state set to ${!pinned} via action.setPinned`);
              } else {
                log("PanelManager", "Pin API not available on action; opening manage page instead");
                this.manageExtension(extensionId);
              }
            }
          }
        } else {
          // Last resort: open manage page where user can pin
          this.manageExtension(extensionId);
        }
      } catch (error) {
        logError("PanelManager", "Error pinning extension to toolbar", error);
      }
      
      this.hidePanel();
    } catch (error) {
      logError("PanelManager", "Error in pinExtensionToToolbar", error);
    }
  }

  /**
   * Manages extension (opens extension details)
   * @param {string} extensionId - The extension ID
   */
  async manageExtension(extensionId) {
    try {
      log("PanelManager", `Managing extension ${extensionId}`);

      // Open only the extension's declared optionsUrl when present
      const addon = await AddonManager.getAddonByID(extensionId);
      const optionsUrl = addon && addon.optionsUrl;
      if (optionsUrl) {
        const principal = Services.scriptSecurityManager.getSystemPrincipal();
        const tab = gBrowser.addTab(optionsUrl, { triggeringPrincipal: principal });
        gBrowser.selectedTab = tab;
      } else {
        log("PanelManager", `No optionsUrl for extension ${extensionId}`);
      }
      
      this.hidePanel();
    } catch (error) {
      logError("PanelManager", "Error managing extension", error);
    }
  }

  /**
   * Removes/uninstalls extension
   * @param {string} extensionId - The extension ID
   */
  async removeExtension(extensionId) {
    try {
      log("PanelManager", `Removing extension ${extensionId}`);
      
      // Get the extension addon
      const addon = await AddonManager.getAddonByID(extensionId);
      if (!addon) {
        log("PanelManager", `Extension ${extensionId} not found for removal`);
        return;
      }
      
      // Show confirmation dialog
      const confirmed = Services.prompt.confirm(
        window,
        "Remove Extension",
        `Are you sure you want to remove "${addon.name}"? This action cannot be undone.`
      );
      
      if (!confirmed) {
        log("PanelManager", `Extension removal cancelled for ${extensionId}`);
        return;
      }
      
      // Uninstall the extension
      if (typeof addon.uninstall === "function") {
        await addon.uninstall();
      } else if (typeof addon.remove === "function") {
        await addon.remove();
      } else {
        // As a fallback, direct the user to manage page
        this.manageExtension(extensionId);
        return;
      }
      log("PanelManager", `Extension ${extensionId} removed successfully`);
      
      // Refresh the extensions display
      this.updateExtensions();
      
      this.hidePanel();
    } catch (error) {
      logError("PanelManager", "Error removing extension", error);
    }
  }

  /**
   * Reports extension
   * @param {string} extensionId - The extension ID
   */
  reportExtension(extensionId) {
    try {
      log("PanelManager", `Reporting extension ${extensionId}`);
      
      // Get extension info
      const addon = AddonManager.getAddonByID(extensionId);
      if (!addon) {
        log("PanelManager", `Extension ${extensionId} not found for reporting`);
        return;
      }
      
      // Open the AMO feedback page for the extension using the add-on ID
      const amoId = addon.id || extensionId;
      const reportUrl = `https://addons.mozilla.org/firefox/feedback/addon/${amoId}/`;
      const principal = Services.scriptSecurityManager.getSystemPrincipal();
      const newTab = gBrowser.addTab(reportUrl, { 
        triggeringPrincipal: principal 
      });
      
      // Switch to the new tab
      gBrowser.selectedTab = newTab;
      
      this.hidePanel();
    } catch (error) {
      logError("PanelManager", "Error reporting extension", error);
    }
  }

  // ============================================================================
  // EXTRAS FUNCTIONALITY
  // ============================================================================

  /**
   * Shows the context menu for the extras function
   * @param {Event} event - The click event
   */
  showExtrasContextMenu(event) {
    const contextMenu = document.querySelector("#extras-context-menu");
    if (contextMenu) {
      // Setup listeners only once
      if (!this.extrasMenuListenersSetup) {
        this.setupExtrasMenuListeners();
        this.extrasMenuListenersSetup = true;
      }
      
      // Position the menu at the mouse location
      contextMenu.openPopupAtScreen(event.screenX, event.screenY, false);
    }
  }

  /**
   * Sets up event listeners for the extras context menu items
   */
  setupExtrasMenuListeners() {
    log("PanelManager", "Setting up extras menu listeners");
    
    const clearCacheMenu = document.querySelector("#clear-cache-button");
    if (clearCacheMenu) {
      clearCacheMenu.addEventListener("command", () => {
        log("PanelManager", "Clear cache command triggered");
        this.clearCache();
      });
    }

    const clearCookiesMenu = document.querySelector("#clear-cookies-button");
    if (clearCookiesMenu) {
      clearCookiesMenu.addEventListener("command", async () => {
        log("PanelManager", "Clear cookies command triggered");
        await this.clearCookies();
      });
    }

    const manageExtensionsMenu = document.querySelector("#manage-extensions-button");
    if (manageExtensionsMenu) {
      manageExtensionsMenu.addEventListener("command", () => {
        log("PanelManager", "Manage extensions command triggered");
        this.manageExtensions();
      });
    }

    const pagePermissionsMenu = document.querySelector("#page-permissions-button");
    if (pagePermissionsMenu) {
      pagePermissionsMenu.addEventListener("command", () => {
        log("PanelManager", "Page permissions command triggered");
        this.showPagePermissions();
      });
    }
    
    log("PanelManager", "Extras menu listeners setup complete");
  }

  /**
   * Clears cache for the current page
   */
  clearCache() {
    log("PanelManager", "Clearing cache for current page");
    try {
      const currentURI = gBrowser.currentURI;
      if (currentURI) {
        // Clear cache for the current page's domain
        Services.obs.notifyObservers(null, "browser:purge-session-history", "");
        
        // Also try to clear the specific page from cache
        const cacheService = Services.cache2;
        if (cacheService) {
          cacheService.clear();
        }
        
        // Refresh the current tab after clearing cache
        log("PanelManager", "Refreshing tab after cache clear");
        gBrowser.reload();
      }
    } catch (error) {
      logError("PanelManager", "Error clearing cache", error);
    }
    this.hidePanel();
  }

  /**
   * Clears cookies for the current page domain
   */
  async clearCookies() {
    log("PanelManager", "Clearing cookies for current page domain");
    try {
      const currentURI = gBrowser.currentURI;
      if (currentURI) {
        const host = currentURI.host;
        if (host) {
          // Try using the newer cookie management approach
          try {
            // Method 1: Use the newer cookie service
            const { CookieManager } = ChromeUtils.import("resource://gre/modules/CookieManager.jsm");
            const cookieManager = new CookieManager();
            
            // Get cookies for the domain
            const cookies = await cookieManager.getCookiesFromHost(host);
            
            let removedCount = 0;
            for (const cookie of cookies) {
              try {
                await cookieManager.remove(cookie);
                removedCount++;
              } catch (error) {
                log("PanelManager", `Failed to remove cookie: ${cookie.name}`);
              }
            }
            
            log("PanelManager", `Cookie clearing complete for ${host}: ${removedCount} removed using new API`);
          } catch (newApiError) {
            // Fallback to the old method with a simpler approach
            log("PanelManager", "New cookie API failed, trying fallback method");
            
            const cookieManager = Services.cookies;
            const cookies = cookieManager.getCookiesFromHost(host, {});
            
            let removedCount = 0;
            let failedCount = 0;
            
            // Try a simpler approach - just clear all cookies for the domain
            try {
              // Use the removeAllFromHost method if available
              if (cookieManager.removeAllFromHost) {
                cookieManager.removeAllFromHost(host, {});
                removedCount = cookies.length;
                log("PanelManager", `Cleared all cookies for ${host} using removeAllFromHost`);
              } else {
                // Fallback to individual removal with minimal parameters
                for (const cookie of cookies) {
                  try {
                    // Try the simplest possible removal
                    cookieManager.remove(cookie.host, cookie.name, "/", false, {});
                    removedCount++;
                  } catch (error) {
                    failedCount++;
                  }
                }
                log("PanelManager", `Cookie clearing complete for ${host}: ${removedCount} removed, ${failedCount} failed`);
              }
            } catch (fallbackError) {
              logError("PanelManager", "All cookie removal methods failed", fallbackError);
            }
          }
          
          // Refresh the current tab after clearing cookies
          log("PanelManager", "Refreshing tab after cookie clear");
          gBrowser.reload();
        }
      }
    } catch (error) {
      logError("PanelManager", "Error clearing cookies", error);
    }
    this.hidePanel();
  }

  /**
   * Opens the extensions management page
   */
  manageExtensions() {
    log("PanelManager", "Opening extensions management");
    try {
      // Open about:addons in a new tab with proper principal
      const principal = Services.scriptSecurityManager.getSystemPrincipal();
      const newTab = gBrowser.addTab("about:addons", { triggeringPrincipal: principal });
      
      // Switch to the new tab
      gBrowser.selectedTab = newTab;
    } catch (error) {
      logError("PanelManager", "Error opening extensions management", error);
    }
    this.hidePanel();
  }

  /**
   * Shows page permissions dialog
   */
  showPagePermissions() {
    log("PanelManager", "Showing page permissions");
    try {
      // Open the page info dialog which shows permissions
      const principal = Services.scriptSecurityManager.getSystemPrincipal();
      const newTab = gBrowser.addTab("about:preferences#privacy", { triggeringPrincipal: principal });
      
      // Switch to the new tab
      gBrowser.selectedTab = newTab;
    } catch (error) {
      logError("PanelManager", "Error opening page permissions", error);
    }
    this.hidePanel();
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  /**
   * Cleanup method to remove listeners
   */
  cleanup() {
    if (this.addonListener) {
      AddonManager.removeAddonListener(this.addonListener);
      this.addonListener = null;
      log("PanelManager", "AddonManager listener removed");
    }
    
    // Clean up context menu
    this.hideExtensionContextMenu();
    
    // Reset extras menu listeners flag
    this.extrasMenuListenersSetup = false;
  }
}

// ============================================================================
// INITIALIZATION AND EVENT HANDLING
// ============================================================================

/**
 * Initializes the URL bar modifier
 */
function initializeURLBarModifier() {
  if (window.urlBarModifierInitialized) {
    log("URLBarModifier", "Already initialized, skipping");
    return;
  }

  window.urlBarModifierInitialized = true;
  
  const panelManager = new PanelManager();
  window.panelManager = panelManager;
  
  setupEventListeners(panelManager);
  log("URLBarModifier", "Initialization complete");
}

/**
 * Sets up global event listeners
 * @param {PanelManager} panelManager - The panel manager instance
 */
function setupEventListeners(panelManager) {
  // Cleanup on window unload
  window.addEventListener("unload", () => {
    if (window.panelManager) {
      window.panelManager.cleanup();
    }
  });
  
  // Setup DOM content loaded listener
  window.addEventListener("DOMContentLoaded", () => {
    setupPageActionButton(panelManager);
  });
}

/**
 * Sets up the page action button
 * @param {PanelManager} panelManager - The panel manager instance
 */
function setupPageActionButton(panelManager) {
  const pageActionButtons = document.querySelector(SELECTORS.PAGE_ACTION_BUTTONS);
  
  if (!pageActionButtons) {
    log("URLBarModifier", "No page-action-buttons container found");
    return;
  }

  if (pageActionButtons.hasAttribute("data-urlbar-modified")) {
    log("URLBarModifier", "Already modified, skipping");
    return;
  }

        pageActionButtons.setAttribute("data-urlbar-modified", "true");
        
        const buttonXUL = `
    <hbox id="${CONFIG.BUTTON_ID}" class="urlbar-page-action" role="button">
            <image id="controls-button" class="urlbar-icon"></image>
          </hbox>
        `;

        appendXUL(pageActionButtons, buttonXUL, null, true);

  const button = document.querySelector(SELECTORS.BUTTON);
        if (button) {
          button.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            panelManager.togglePanel(button);
          });
    log("URLBarModifier", "Added click handler to button");
  }
}

// Initialize the URL bar modifier
initializeURLBarModifier();
