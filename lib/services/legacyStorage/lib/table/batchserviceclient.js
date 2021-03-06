﻿// 
// Copyright (c) Microsoft and contributors.  All rights reserved.
// 
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//   http://www.apache.org/licenses/LICENSE-2.0
// 
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// 
// See the License for the specific language governing permissions and
// limitations under the License.
// 

// Module dependencies.
var util = require('util');
var crypto = require('crypto');

var azureCommon = require('azure-common');
var azureutil = azureCommon.util;
var StorageServiceClient = azureCommon.StorageServiceClient;
var ServiceClient = azureCommon.ServiceClient;
var WebResource = azureCommon.WebResource;
var Constants = azureCommon.Constants;
var HeaderConstants = Constants.HeaderConstants;

/**
* Creates a new BatchServiceClient.
*
* Implements a batch service client able to produce OData batch requests from an array of operations.
* For more information about OData batch processing refer to http://www.odata.org/developers/protocols/batch.
*
* @constructor
*/
function BatchServiceClient(storageAccount, storageAccessKey, host, usePathStyleUri, authenticationProvider) {
  BatchServiceClient['super_'].call(this, storageAccount, storageAccessKey, host, usePathStyleUri, authenticationProvider);

  this.operations = null;
}

util.inherits(BatchServiceClient, StorageServiceClient);

// Module constants.
BatchServiceClient.BATCH_CODE = -1;

/**
* Begins a new batch scope.
*
* @return {undefined}
*/
BatchServiceClient.prototype.beginBatch = function () {
  this.operations = [];
};

/**
* Determines if there is a current batch.
*
* @return {boolean} Boolean value indicating if service is in a batch context or not.
*/
BatchServiceClient.prototype.isInBatch = function () {
  return this.operations !== null;
};

/**
* Terminates the current batch scope by clearing current operations.
*
* @return {undefined}
*/
BatchServiceClient.prototype.rollback = function () {
  this.operations = null;
};

/**
* Returns a boolean value indicating weather there are operations queued up for execution in a batch or not.
*
* @return {Boolean} True if there are operations queued up; false otherwise.
*/
BatchServiceClient.prototype.hasOperations = function () {
  return this.isInBatch() &&
         this.operations.length > 0;
};

/**
* Adds an operation to the batch.
*
* @param {object}  webResource The request parameters.
* @param {object}  outputData  The body for the operation.
* @return {undefined}
*/
BatchServiceClient.prototype.addOperation = function (webResource, outputData) {
  if (azureutil.objectIsNull(outputData)) {
    outputData = '';
  }

  if (webResource.method !== 'GET') {
    webResource.headers[HeaderConstants.CONTENT_ID] = this.operations.length + 1;

    if (webResource.method !== 'DELETE') {
      webResource.headers[HeaderConstants.CONTENT_TYPE] = 'application/atom+xml;charset="utf-8";type=entry';
    } else {
      delete webResource.headers[HeaderConstants.CONTENT_TYPE];
    }

    webResource.headers[HeaderConstants.CONTENT_LENGTH] = Buffer.byteLength(outputData, 'utf8');
  }

  this._setRequestUrl(webResource);
  var operation = {
    webResource: webResource
  };

  operation.content = webResource.method + ' ' + webResource.uri + ' HTTP/1.1\n';

  Object.keys(webResource.headers).forEach(function (header) {
    operation.content += header + ': ' + webResource.headers[header] + '\n';
  });

  operation.content += '\n';
  operation.content += outputData;

  this.operations.push(operation);
};

/**
* Commits the operations within the batch scope.
*
* @param {object}      [options]                        The request options.
* @param {int}         [options.timeoutIntervalInMs]    The timeout interval, in milliseconds, to use for the request.
* @param {function}    callback                         The response callback function.
* @return {undefined}
*/
BatchServiceClient.prototype.commitBatch = function (optionsOrCallback, callback) {
  var options = null;
  if (typeof optionsOrCallback === 'function' && !callback) {
    callback = optionsOrCallback;
  }
  else {
    options = optionsOrCallback;
  }

  if (!this.operations ||
    this.operations.length <= 0) {
    throw new Error('Nothing to commit');
  }

  var batchBoundary = 'batch_' + crypto.createHash('md5').update('' + (new Date()).getTime()).digest('hex');
  var changesetBoundary = 'changeset_' + crypto.createHash('md5').update('' + (new Date()).getTime()).digest('hex');

  var body = '--' + batchBoundary + '\n';
  body += HeaderConstants.CONTENT_TYPE + ': multipart/mixed;charset="utf-8";boundary=' + changesetBoundary + '\n\n';

  this.operations.forEach(function (operation) {
    body += '--' + changesetBoundary + '\n';
    body += HeaderConstants.CONTENT_TYPE + ': application/http\n';
    body += HeaderConstants.CONTENT_TRANSFER_ENCODING_HEADER + ': binary\n\n';
    body += operation.content + '\n';
  });

  body += '--' + changesetBoundary + '--\n';
  body += '--' + batchBoundary + '--';

  var webResource = WebResource.post('$batch')
    .withRawResponse(true);

  webResource.withHeader(HeaderConstants.CONTENT_TYPE, 'multipart/mixed;charset="utf-8";boundary=' + batchBoundary);
  webResource.withHeader(HeaderConstants.DATA_SERVICE_VERSION, '1.0;NetFx');
  webResource.withHeader(HeaderConstants.MAX_DATA_SERVICE_VERSION, '2.0;NetFx');
  webResource.withHeader(HeaderConstants.CONTENT_LENGTH, Buffer.byteLength(body, 'utf8'));

  var self = this;

  // Store current operations to process response
  // and clear batch operation to end isInBatch state after commiting
  var requestOperations = this.operations;
  this.operations = null;

  var processResponseCallback = function (responseObject, next) {
    var responseObjects = self.processResponse(responseObject, requestOperations);
    // @see http://www.odata.org/documentation/batch#FormatOfABatchResponse
    // The body of a ChangeSet response is either a response for all the successfully processed change 
    // requests within the ChangeSet, formatted exactly as it would have appeared outside of a batch, 
    // or a single response indicating a failure of the entire ChangeSet.
    if (responseObjects && responseObjects.length > 0 && !responseObjects[0].isSuccessful) {
      responseObject = responseObjects[0];
    } else {
      responseObject.operationResponses = responseObjects;
    }

    var finalCallback = function (returnObject) {
      // perform final callback
      callback(returnObject.error, returnObject.operationResponses, returnObject.response);
    };

    next(responseObject, finalCallback);
  };

  this.performRequest(webResource, body, options, processResponseCallback);
};

/**
* Processes a batch response.
*
* @param {object} responseObject The response object for the batch request.
* @return {array} An array with the processed / parsed responses.
*/
BatchServiceClient.prototype.processResponse = function (responseObject, requestOperations) {
  var self = this;
  var responses = null;
  if (responseObject && responseObject.response && responseObject.response.body &&
      typeof responseObject.response.body === 'string') {
    responses = [];
    var rawResponses = responseObject.response.body.split(Constants.CHANGESET_DELIMITER);

    var validResponse = 0;
    rawResponses.forEach(function (rawResponse) {
      // Find HTTP/1.1 CODE line
      var httpLocation = rawResponse.indexOf('HTTP/');
      if (httpLocation !== -1) {
        rawResponse = rawResponse.substring(httpLocation);
        // valid response
        var response = self.processOperation(requestOperations[validResponse++].webResource, rawResponse);
        responses.push(response);
      }
    });
  }

  return responses;
};

/**
* Processes a partial response.
*
* @param {WebResource} webResource The web resource for the response.
* @param {string}      rawResponse The raw, unparsed, http response from the server for the batch response.
* @return {object} A response object.
*/
BatchServiceClient.prototype.processOperation = function (webResource, rawResponse) {
  var self = this;

  var responseObject = {
    error: null,
    response: { }
  };

  // Retrieve response code
  var firstSpace = rawResponse.indexOf(' ');
  responseObject.response.statusCode = parseInt(rawResponse.substring(firstSpace + 1, rawResponse.indexOf(' ', firstSpace + 2)), 10);
  responseObject.response.isSuccessful = webResource.validResponse(responseObject.response.statusCode);

  // Skip that line
  rawResponse = rawResponse.substring(rawResponse.indexOf('\n'));

  // Split into multiple lines and process them
  var responseLines = rawResponse.split('\r\n');

  // Populate headers
  responseObject.response.headers = { };
  responseObject.response.body = '';

  var isBody = false;
  responseLines.forEach(function (line) {
    if (line === '' && !isBody) {
      isBody = true;
    } else if (isBody) {
      responseObject.response.body += line;
    } else {
      var headerSplit = line.indexOf(':');
      if (headerSplit !== -1) {
        responseObject.response.headers[line.substring(0, headerSplit).trim()] = line.substring(headerSplit + 1).trim();
      }
    }
  });

  ServiceClient._parseResponse(responseObject.response, self.xml2jsSettings);
  if (!responseObject.response.isSuccessful) {
    responseObject.error = ServiceClient._normalizeError(responseObject.response.body, responseObject.response);
  }

  return responseObject;
};

module.exports = BatchServiceClient;
