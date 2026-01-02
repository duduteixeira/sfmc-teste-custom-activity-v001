'use strict';

// =====================
// SFMC POSTMONGER SESSION
// =====================
var connection = new Postmonger.Session();
var payload = {};
var steps = [{ label: 'Configure', key: 'configure' }];
var currentStepIndex = 0;
var currentStep = steps.length > 0 ? steps[0].key : 'step1';
var lastFocusedField = null; // Track last focused input/textarea for variable insertion
var useSidebarPanel = true;

// Field configurations from builder
var fieldConfigs = [
  {
    "id": "647c8697-703d-4c2b-a970-df6e71fbb529",
    "type": "text-input",
    "required": false,
    "validation": null,
    "webServices": [],
    "eventHandlers": [],
    "conditionalVisibility": null,
    "customInit": null
  },
  {
    "id": "9e3871e9-afc1-4232-98e2-29477ff2610e",
    "type": "textarea",
    "required": false,
    "validation": null,
    "webServices": [],
    "eventHandlers": [],
    "conditionalVisibility": null,
    "customInit": null
  }
];

// =====================
// REGISTER ALL LISTENERS BEFORE READY
// =====================
// CRITICAL: All event listeners MUST be registered before calling 'ready'
// This ensures SFMC can properly communicate with the activity

connection.on('initActivity', initialize);
connection.on('initActivityRunningMode', initializeRunningMode);
connection.on('initActivityRunningHover', initializeRunningHover);
connection.on('requestedTokens', onGetTokens);
connection.on('requestedEndpoints', onGetEndpoints);
connection.on('requestedInteraction', onGetInteraction);
connection.on('requestedTriggerEventDefinition', onGetTriggerEventDefinition);
connection.on('requestedSchema', onGetSchema);
connection.on('clickedNext', onClickedNext);
connection.on('clickedBack', onClickedBack);
connection.on('gotoStep', onGotoStep);

// =====================
// DOCUMENT READY - TRIGGER READY AFTER DOM IS LOADED
// =====================
$(document).ready(function() {
  console.log('[CA] Document ready, triggering SFMC ready...');
  
  // Trigger ready to tell SFMC we're initialized
  connection.trigger('ready');
  
  // Request context data from SFMC
  connection.trigger('requestTokens');
  connection.trigger('requestEndpoints');
  connection.trigger('requestInteraction');
  connection.trigger('requestTriggerEventDefinition');
  connection.trigger('requestSchema');
  
  // Initialize UI handlers
  initializeEventHandlers();
  initializeConditionalFields();
  runCustomInitScripts();
  
  // Show first step
  showStep(currentStep);
  
  console.log('[CA] Initialization complete, waiting for SFMC initActivity...');
});

// =====================
// RUNNING MODE HANDLERS
// =====================
function initializeRunningMode(data) {
  console.log('[CA] Running Mode:', data);
}

function initializeRunningHover(data) {
  console.log('[CA] Running Hover:', data);
}

function onGetInteraction(interaction) {
  console.log('[CA] Interaction:', interaction);
}

function onGetTriggerEventDefinition(eventDef) {
  console.log('[CA] Trigger Event Definition:', eventDef);
}

// Store schema fields globally for variable insertion
var schemaFields = [];

function onGetSchema(data) {
  console.log('[CA] Schema received:', data);
  
  // Handle both data.schema and direct data formats
  var schema = data && data.schema ? data.schema : data;
  
  if (!schema || !Array.isArray(schema)) {
    console.log('[CA] No valid schema array found');
    return;
  }
  
  schemaFields = [];
  
  // Internal SFMC fields to exclude
  var excludedFields = ['randomNumber', 'actualChoice', '_CustomObjectKey', 'ContactKey'];
  
  schema.forEach(function(item) {
    // Each item should have a 'key' property like "Event.DEAudience-xxxx.FieldName"
    var key = item.key || item.name || item;
    
    if (typeof key === 'string' && key.length > 0) {
      // Extract friendly name (last part of the key)
      var parts = key.split('.');
      var friendlyName = parts[parts.length - 1];
      
      // Skip internal SFMC fields
      if (excludedFields.indexOf(friendlyName) !== -1) {
        console.log('[CA] Skipping internal field:', friendlyName);
        return;
      }
      
      // Use Marketing Cloud mask format: %%fieldName%%
      schemaFields.push({
        key: key,
        label: friendlyName,
        token: '%%' + friendlyName + '%%'
      });
    }
  });
  
  console.log('[CA] Parsed schema fields:', schemaFields);
  
  // Populate all variable selects
  populateVariableSelects();
}

function populateVariableSelects() {
  $('.variable-select').each(function() {
    var $select = $(this);
    var currentVal = $select.val();
    
    // Clear existing options except first
    $select.find('option:not(:first)').remove();
    
    // Add schema fields as options
    schemaFields.forEach(function(field) {
      $select.append(
        $('<option></option>')
          .val(field.token)
          .text(field.label)
          .attr('title', field.key)
      );
    });
    
    // Restore previous selection if valid
    if (currentVal) {
      $select.val(currentVal);
    }
  });
  
  // Also populate sidebar panel if it exists
  if (useSidebarPanel) {
    populateSidebarPanel();
  }
}

function populateSidebarPanel() {
  var $dropdown = $('#variableDropdown');
  
  if (!$dropdown.length) return;
  
  // Clear existing options
  $dropdown.empty();
  
  if (schemaFields.length === 0) {
    $dropdown.append('<option value="">Nenhuma variável disponível</option>');
    return;
  }
  
  // Add placeholder option
  $dropdown.append('<option value="">Selecione uma variável...</option>');
  
  // Add schema fields as options
  schemaFields.forEach(function(field) {
    $dropdown.append(
      $('<option></option>')
        .val(field.token)
        .text(field.label)
        .attr('title', field.key)
    );
  });
  
  // Insert directly on selection change
  $dropdown.off('change').on('change', function() {
    var token = $(this).val();
    if (token) {
      insertVariableFromSidebar(token);
      // Reset dropdown after insertion
      $(this).val('');
    }
  });
}

function insertVariableFromSidebar(token) {
  // Insert into last focused field, or find the first variable-target field
  var $target = null;
  
  if (lastFocusedField && $(lastFocusedField).hasClass('variable-target')) {
    $target = $(lastFocusedField);
  } else {
    // Find first visible variable-target field
    $target = $('.variable-target:visible').first();
  }
  
  if ($target && $target.length) {
    insertAtCursor($target[0], token);
    // Flash effect to show insertion
    $target.addClass('active-target');
    setTimeout(function() {
      $target.removeClass('active-target');
    }, 300);
  } else {
    alert('Por favor, clique em um campo de texto primeiro.');
  }
}

// Show/hide fields based on the current Salesforce wizard step
function showStep(stepKey) {
  // Hide all step field groups
  $('.step-fields').hide();
  // Show the current step's fields
  $('.step-fields[data-step="' + stepKey + '"]').show();
}

function initialize(data) {
  console.log('Initialize:', data);
  
  if (data) {
    payload = data;
  }
  
  const hasInArguments = Boolean(
    payload['arguments'] &&
    payload['arguments'].execute &&
    payload['arguments'].execute.inArguments &&
    payload['arguments'].execute.inArguments.length > 0
  );

  const inArguments = hasInArguments
    ? payload['arguments'].execute.inArguments
    : [];

  // Populate form with saved values
  inArguments.forEach(function(arg) {
    const key = Object.keys(arg)[0];
    const value = arg[key];
    const $field = $('#' + key);
    
    if ($field.length) {
      if ($field.is(':checkbox')) {
        $field.prop('checked', value === true || value === 'true');
      } else if ($field.is(':radio')) {
        $('input[name="' + key + '"][value="' + value + '"]').prop('checked', true);
      } else {
        $field.val(value);
      }
    }
  });

  // Re-evaluate conditional visibility after loading values
  evaluateConditionalFields();
  
  updateButtons();
}

function updateButtons() {
  const isLastStep = currentStepIndex === steps.length - 1;
  const isFirstStep = currentStepIndex === 0;
  
  // Update next button text
  connection.trigger('updateButton', {
    button: 'next',
    text: isLastStep ? 'Done' : 'Next',
    visible: true
  });
  
  // Update back button
  connection.trigger('updateButton', {
    button: 'back',
    visible: !isFirstStep
  });
}

function onGetTokens(tokens) {
  console.log('Tokens:', tokens);
}

function onGetEndpoints(endpoints) {
  console.log('Endpoints:', endpoints);
}

function onClickedNext() {
  // Validate current step before allowing Salesforce to proceed
  if (!validateCurrentStep()) {
    return;
  }
  
  if (currentStepIndex < steps.length - 1) {
    // Not the last step - tell Salesforce to go to next step
    connection.trigger('nextStep');
  } else {
    // Last step - save and close
    save();
  }
}

function onClickedBack() {
  if (currentStepIndex > 0) {
    // Tell Salesforce to go to previous step
    connection.trigger('prevStep');
  }
}

// Called by Salesforce when the wizard step changes (user clicks header or next/back)
function onGotoStep(step) {
  const stepIndex = steps.findIndex(function(s) { return s.key === step.key; });
  if (stepIndex >= 0) {
    currentStepIndex = stepIndex;
    currentStep = step.key;
    showStep(currentStep);
    updateButtons();
  }
}

// =====================
// VALIDATION
// =====================
function validateCurrentStep() {
  var isValid = true;
  
  // Find fields in the current step
  $('.step-fields[data-step="' + currentStep + '"]').find('input, textarea, select').each(function() {
    const $field = $(this);
    const fieldId = $field.attr('name') || $field.attr('id');
    const fieldConfig = fieldConfigs.find(f => f.id === fieldId);
    
    // Clear previous errors
    $field.removeClass('error');
    
    // Skip hidden fields
    if ($field.closest('.form-group').hasClass('field-hidden') || $field.closest('.form-group').is(':hidden')) {
      return;
    }
    
    const value = $field.is(':checkbox') ? $field.is(':checked') : $field.val();
    
    // Required validation
    if ($field.attr('required') && !value) {
      $field.addClass('error');
      isValid = false;
      return;
    }
    
    // Skip further validation if empty and not required
    if (!value) return;
    
    if (fieldConfig && fieldConfig.validation) {
      const val = fieldConfig.validation;
      
      // Min/Max length
      if (val.minLength && String(value).length < val.minLength) {
        $field.addClass('error');
        isValid = false;
        return;
      }
      if (val.maxLength && String(value).length > val.maxLength) {
        $field.addClass('error');
        isValid = false;
        return;
      }
      
      // Pattern validation
      if (val.pattern) {
        const regex = new RegExp(val.pattern);
        if (!regex.test(String(value))) {
          $field.addClass('error');
          isValid = false;
          return;
        }
      }
      
      // Custom validation function
      if (val.customValidation) {
        try {
          const customFn = new Function('value', 'field', val.customValidation);
          const result = customFn(value, $field);
          if (result === false) {
            $field.addClass('error');
            isValid = false;
            return;
          }
        } catch (e) {
          console.error('Custom validation error:', e);
        }
      }
    }
  });
  
  return isValid;
}

// =====================
// WEB SERVICES
// =====================
function callWebService(serviceConfig, fieldId, triggerEvent) {
  const $field = $('#' + fieldId);
  const $formGroup = $field.closest('.form-group');
  
  // Build URL with placeholders
  let url = serviceConfig.url;
  $('form').find('input, textarea, select').each(function() {
    const name = $(this).attr('name') || $(this).attr('id');
    const val = $(this).is(':checkbox') ? $(this).is(':checked') : $(this).val();
    url = url.replace(new RegExp('{{' + name + '}}', 'g'), encodeURIComponent(val || ''));
  });
  
  // Build body with placeholders
  let body = serviceConfig.body || '';
  $('form').find('input, textarea, select').each(function() {
    const name = $(this).attr('name') || $(this).attr('id');
    const val = $(this).is(':checkbox') ? $(this).is(':checked') : $(this).val();
    body = body.replace(new RegExp('{{' + name + '}}', 'g'), val || '');
  });
  
  $formGroup.addClass('field-loading');
  
  $.ajax({
    url: url,
    method: serviceConfig.method || 'GET',
    data: body ? JSON.parse(body) : undefined,
    contentType: 'application/json',
    success: function(response) {
      console.log('Web service response:', response);
      
      // Map response to field if configured
      if (serviceConfig.responseMapping) {
        try {
          const mappingFn = new Function('response', 'field', serviceConfig.responseMapping);
          mappingFn(response, $field);
        } catch (e) {
          console.error('Response mapping error:', e);
        }
      }
    },
    error: function(xhr, status, error) {
      console.error('Web service error:', error);
    },
    complete: function() {
      $formGroup.removeClass('field-loading');
    }
  });
}

// =====================
// VARIABLE INSERTION
// =====================
function initializeVariableInsertion() {
  // Track last focused field for sidebar variable insertion
  $(document).on('focus', '.variable-target, input[type="text"], textarea', function() {
    lastFocusedField = this;
    $('.variable-target').removeClass('active-target');
    $(this).addClass('active-target');
  });
  
  $(document).on('blur', '.variable-target, input[type="text"], textarea', function() {
    var field = this;
    // Delay removing active state to allow click on sidebar
    setTimeout(function() {
      if (lastFocusedField === field) {
        $(field).removeClass('active-target');
      }
    }, 200);
  });
  
  // Handle inline insert variable button clicks (for inline mode)
  $(document).on('click', '.btn-insert-variable', function() {
    var targetId = $(this).data('target');
    var $select = $('.variable-select[data-target="' + targetId + '"]');
    var $textarea = $('#' + targetId);
    
    var variableToken = $select.val();
    if (!variableToken) {
      alert('Por favor, selecione uma variável primeiro.');
      return;
    }
    
    insertAtCursor($textarea[0], variableToken);
    
    // Reset select
    $select.val('');
  });
  
  // Handle sidebar search
  $(document).on('input', '#variableSearch', function() {
    var searchTerm = $(this).val().toLowerCase();
    
    $('.variable-item').each(function() {
      var $item = $(this);
      var label = $item.find('.var-name').text().toLowerCase();
      var key = ($item.attr('title') || '').toLowerCase();
      
      if (label.indexOf(searchTerm) !== -1 || key.indexOf(searchTerm) !== -1) {
        $item.show();
      } else {
        $item.hide();
      }
    });
  });
}

function insertAtCursor(element, text) {
  // Handle both input and textarea
  if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
    var startPos = element.selectionStart || 0;
    var endPos = element.selectionEnd || 0;
    var currentValue = element.value || '';
    
    // Insert text at cursor position
    element.value = currentValue.substring(0, startPos) + text + currentValue.substring(endPos);
    
    // Move cursor to after inserted text
    var newPos = startPos + text.length;
    element.selectionStart = newPos;
    element.selectionEnd = newPos;
    element.focus();
    
    // Trigger change event for any listeners
    $(element).trigger('change');
  }
}

// =====================
// EVENT HANDLERS
// =====================
function initializeEventHandlers() {
  // Initialize variable insertion for textareas
  initializeVariableInsertion();
  
  // Initialize Element Selector handlers
  initializeElementSelectors();
  
  fieldConfigs.forEach(function(config) {
    if (!config.eventHandlers || !config.eventHandlers.length) return;
    
    const $field = $('#' + config.id);
    if (!$field.length) return;
    
    config.eventHandlers.forEach(function(handler) {
      $field.on(handler.event, function(e) {
        try {
          const handlerFn = new Function('event', 'field', 'value', handler.handler);
          const value = $field.is(':checkbox') ? $field.is(':checked') : $field.val();
          handlerFn(e, $field, value);
        } catch (err) {
          console.error('Event handler error:', err);
        }
      });
    });
    
    // Initialize web service triggers
    if (config.webServices && config.webServices.length) {
      config.webServices.forEach(function(ws) {
        if (ws.trigger === 'load') {
          callWebService(ws, config.id, 'load');
        } else {
          $field.on(ws.trigger, function() {
            callWebService(ws, config.id, ws.trigger);
          });
        }
      });
    }
  });
}

// =====================
// CONDITIONAL VISIBILITY
// =====================
function initializeConditionalFields() {
  // Attach change listeners to all fields
  $('form').find('input, textarea, select').on('change input', function() {
    evaluateConditionalFields();
  });
  
  // Initial evaluation
  evaluateConditionalFields();
}

function evaluateConditionalFields() {
  fieldConfigs.forEach(function(config) {
    if (!config.conditionalVisibility) return;
    
    const $field = $('#' + config.id);
    const $formGroup = $field.closest('.form-group');
    if (!$formGroup.length) return;
    
    try {
      // Build context with all form values
      const formValues = {};
      $('form').find('input, textarea, select').each(function() {
        const name = $(this).attr('name') || $(this).attr('id');
        formValues[name] = $(this).is(':checkbox') ? $(this).is(':checked') : $(this).val();
      });
      
      const conditionFn = new Function('values', 'return ' + config.conditionalVisibility);
      const shouldShow = conditionFn(formValues);
      
      if (shouldShow) {
        $formGroup.removeClass('field-hidden').show();
      } else {
        $formGroup.addClass('field-hidden').hide();
      }
    } catch (e) {
      console.error('Conditional visibility error:', e);
    }
  });
}

// =====================
// CUSTOM INIT
// =====================
function runCustomInitScripts() {
  fieldConfigs.forEach(function(config) {
    if (!config.customInit) return;
    
    const $field = $('#' + config.id);
    if (!$field.length) return;
    
    try {
      const initFn = new Function('field', config.customInit);
      initFn($field);
    } catch (e) {
      console.error('Custom init error:', e);
    }
  });
}

// =====================
// ELEMENT SELECTOR
// =====================
function initializeElementSelectors() {
  // Handle element type selector change
  $(document).on('change', '.element-type-selector', function() {
    var $select = $(this);
    var fieldId = $select.attr('data-element-config-target');
    var selectedType = $select.val();
    var $container = $('#' + fieldId + '-config-container');
    
    // Hide all element config forms
    $container.find('.element-config-form').hide();
    
    // Show selected element config form
    if (selectedType) {
      var $configForm = $container.find('[data-element-type="' + selectedType + '"]');
      if ($configForm.length) {
        $configForm.show();
      }
    }
  });
  
  // Handle add CTA button
  $(document).on('click', '.btn-add-cta', function() {
    var targetId = $(this).data('target');
    var $container = $('#' + targetId);
    var index = $container.find('.cta-button-item').length;
    var prefix = targetId.replace('_cta_container', '');
    
    var newCtaHtml = '<div class="cta-button-item" data-cta-index="' + index + '">' +
      '<div class="config-field">' +
        '<label for="' + prefix + '_cta_' + index + '_label">Texto do Botão</label>' +
        '<input type="text" id="' + prefix + '_cta_' + index + '_label" name="' + prefix + '_cta_' + index + '_label" placeholder="Ex: Saiba Mais">' +
      '</div>' +
      '<div class="config-field">' +
        '<label for="' + prefix + '_cta_' + index + '_action">Ação</label>' +
        '<select id="' + prefix + '_cta_' + index + '_action" name="' + prefix + '_cta_' + index + '_action">' +
          '<option value="open_url">Abrir URL</option>' +
          '<option value="deep_link">Deep Link</option>' +
          '<option value="callback">Callback</option>' +
          '<option value="dismiss">Fechar</option>' +
        '</select>' +
      '</div>' +
      '<div class="config-field cta-url-field">' +
        '<label for="' + prefix + '_cta_' + index + '_url">URL / Deep Link</label>' +
        '<input type="text" id="' + prefix + '_cta_' + index + '_url" name="' + prefix + '_cta_' + index + '_url" placeholder="https://... ou app://...">' +
      '</div>' +
      '<button type="button" class="btn-remove-cta" data-index="' + index + '">Remover</button>' +
    '</div>';
    
    $container.append(newCtaHtml);
  });
  
  // Handle remove CTA button
  $(document).on('click', '.btn-remove-cta', function() {
    $(this).closest('.cta-button-item').remove();
  });
  
  // Handle add slide
  $(document).on('click', '.btn-add-slide', function() {
    var targetId = $(this).data('target');
    var $container = $('#' + targetId);
    var index = $container.find('.slide-item').length;
    var prefix = targetId.replace('_slides_container', '');
    
    var newSlideHtml = '<div class="slide-item" data-slide-index="' + index + '">' +
      '<div class="slide-header">Slide ' + (index + 1) + ' <button type="button" class="btn-remove-slide" style="float:right;font-size:11px;padding:2px 6px;">Remover</button></div>' +
      '<div class="config-field">' +
        '<label>Título</label>' +
        '<input type="text" name="' + prefix + '_slide_' + index + '_title" placeholder="Título do slide">' +
      '</div>' +
      '<div class="config-field">' +
        '<label>Subtítulo</label>' +
        '<input type="text" name="' + prefix + '_slide_' + index + '_subtitle" placeholder="Subtítulo">' +
      '</div>' +
      '<div class="config-field">' +
        '<label>URL da Imagem</label>' +
        '<input type="url" name="' + prefix + '_slide_' + index + '_imageUrl" placeholder="https://...">' +
      '</div>' +
      '<div class="config-field">' +
        '<label>URL de Clique</label>' +
        '<input type="url" name="' + prefix + '_slide_' + index + '_linkUrl" placeholder="https://...">' +
      '</div>' +
    '</div>';
    
    $container.append(newSlideHtml);
  });
  
  // Handle remove slide
  $(document).on('click', '.btn-remove-slide', function() {
    $(this).closest('.slide-item').remove();
  });
  
  // Handle add timeline item
  $(document).on('click', '.btn-add-timeline', function() {
    var targetId = $(this).data('target');
    var $container = $('#' + targetId);
    var index = $container.find('.timeline-item').length;
    var prefix = targetId.replace('_timeline_container', '');
    
    var newItemHtml = '<div class="timeline-item" data-timeline-index="' + index + '">' +
      '<button type="button" class="btn-remove-timeline" style="float:right;font-size:11px;padding:2px 6px;">Remover</button>' +
      '<div class="config-field">' +
        '<label>Data/Hora</label>' +
        '<input type="text" name="' + prefix + '_timeline_' + index + '_date" placeholder="Jan 2024">' +
      '</div>' +
      '<div class="config-field">' +
        '<label>Título</label>' +
        '<input type="text" name="' + prefix + '_timeline_' + index + '_title" placeholder="Evento">' +
      '</div>' +
      '<div class="config-field">' +
        '<label>Descrição</label>' +
        '<textarea name="' + prefix + '_timeline_' + index + '_description" rows="2" placeholder="Descrição do evento"></textarea>' +
      '</div>' +
    '</div>';
    
    $container.append(newItemHtml);
  });
  
  // Handle remove timeline item
  $(document).on('click', '.btn-remove-timeline', function() {
    $(this).closest('.timeline-item').remove();
  });
}

// =====================
// SAVE
// =====================
function save() {
  // Collect form data from all steps
  const formData = {};
  
  $('form').find('input, textarea, select').each(function() {
    const $field = $(this);
    const name = $field.attr('name') || $field.attr('id');
    
    // Skip hidden conditional fields
    if ($field.closest('.form-group').hasClass('field-hidden')) {
      return;
    }
    
    if (name) {
      if ($field.is(':checkbox')) {
        formData[name] = $field.is(':checked');
      } else if ($field.is(':radio')) {
        if ($field.is(':checked')) {
          formData[name] = $field.val();
        }
      } else {
        formData[name] = $field.val();
      }
    }
  });
  
  console.log('Saving form data:', formData);
  
  // Build inArguments
  const inArguments = Object.keys(formData).map(function(key) {
    const arg = {};
    arg[key] = formData[key];
    return arg;
  });
  
  payload['arguments'] = payload['arguments'] || {};
  payload['arguments'].execute = payload['arguments'].execute || {};
  payload['arguments'].execute.inArguments = inArguments;
  
  payload['metaData'] = payload['metaData'] || {};
  payload['metaData'].isConfigured = true;
  
  console.log('Final payload:', payload);
  
  connection.trigger('updateActivity', payload);
}

// Form validation
$('form').on('submit', function(e) {
  e.preventDefault();
  onClickedNext();
});

// Cancel button
$('#cancelBtn').on('click', function() {
  connection.trigger('requestInspectorClose');
});
