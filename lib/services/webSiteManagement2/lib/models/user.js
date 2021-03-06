/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for
 * license information.
 * 
 * Code generated by Microsoft (R) AutoRest Code Generator.
 * Changes may cause incorrect behavior and will be lost if the code is
 * regenerated.
 */

'use strict';

var models = require('./index');

var util = require('util');

/**
 * @class
 * Initializes a new instance of the User class.
 * @constructor
 * Represents user crendentials used for publishing activity
 * @member {string} [userName] Username (internal)
 * 
 * @member {string} [publishingUserName] Username used for publishing
 * 
 * @member {string} [publishingPassword] Password used for publishing
 * 
 * @member {string} [scmUri] Service Control Manager URI, including username
 * and password
 * 
 */
function User() {
  User['super_'].call(this);
}

util.inherits(User, models['Resource']);

/**
 * Defines the metadata of User
 *
 * @returns {object} metadata of User
 *
 */
User.prototype.mapper = function () {
  return {
    required: false,
    serializedName: 'User',
    type: {
      name: 'Composite',
      className: 'User',
      modelProperties: {
        id: {
          required: false,
          serializedName: 'id',
          type: {
            name: 'String'
          }
        },
        name: {
          required: false,
          serializedName: 'name',
          type: {
            name: 'String'
          }
        },
        kind: {
          required: false,
          serializedName: 'kind',
          type: {
            name: 'String'
          }
        },
        location: {
          required: true,
          serializedName: 'location',
          type: {
            name: 'String'
          }
        },
        type: {
          required: false,
          serializedName: 'type',
          type: {
            name: 'String'
          }
        },
        tags: {
          required: false,
          serializedName: 'tags',
          type: {
            name: 'Dictionary',
            value: {
                required: false,
                serializedName: 'StringElementType',
                type: {
                  name: 'String'
                }
            }
          }
        },
        userName: {
          required: false,
          serializedName: 'properties.name',
          type: {
            name: 'String'
          }
        },
        publishingUserName: {
          required: false,
          serializedName: 'properties.publishingUserName',
          type: {
            name: 'String'
          }
        },
        publishingPassword: {
          required: false,
          serializedName: 'properties.publishingPassword',
          type: {
            name: 'String'
          }
        },
        scmUri: {
          required: false,
          serializedName: 'properties.scmUri',
          type: {
            name: 'String'
          }
        }
      }
    }
  };
};

module.exports = User;
