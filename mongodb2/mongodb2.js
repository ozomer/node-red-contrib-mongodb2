/**
* Copyright 2015 Awear Solutions Ltd.
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
* http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
**/

module.exports = function(RED) {
  "use strict";
  var url = require("url");
  var appEnv = require("cfenv").getAppEnv();
  var mongodb = require("mongodb");
  var forEachIteration = new Error("node-red-contrib-mongodb2 forEach iteration");
  var forEachEnd = new Error("node-red-contrib-mongodb2 forEach end");

  var services = [];
  Object.keys(appEnv.services).forEach(function(label) {
    if ((/^mongo/i).test(label)) {
      services = services.concat(appEnv.services[label].map(function(service) {
        return {
          "name": service.name,
          "label": service.label
        };
      }));
    }
  });

  var operations = {};
  Object.keys(mongodb.Collection.prototype).forEach(function(operationName) {
    if ('function' == typeof Object.getOwnPropertyDescriptor(mongodb.Collection.prototype, operationName).value) {
      operations[operationName] = mongodb.Collection.prototype[operationName];
    }
  });
  // We don't want to pass the find-operation's cursor directly.
  delete operations.find;

  operations['find.toArray'] = function() {
    var args = Array.prototype.slice.call(arguments, 0);
    var callback = args.pop();
    mongodb.Collection.prototype.find.apply(this, args).toArray(callback);
  };
  operations['find.forEach'] = function() {
    var args = Array.prototype.slice.call(arguments, 0);
    var callback = args.pop();
    mongodb.Collection.prototype.find.apply(this, args).forEach(function(doc) {
      return callback(forEachIteration, doc);
    }, function(err) {
      return callback(err || forEachEnd);
    });
  };

  // We don't want to pass the aggregate's cursor directly.
  delete operations.aggregate;
  operations['aggregate.toArray'] = function() {
    var args = Array.prototype.slice.call(arguments, 0);
    var callback = args.pop();
    mongodb.Collection.prototype.aggregate.apply(this, args).toArray(callback);
  };
  operations['aggregate.forEach'] = function() {
    var args = Array.prototype.slice.call(arguments, 0);
    var callback = args.pop();
    mongodb.Collection.prototype.aggregate.apply(this, args).forEach(function(doc) {
      return callback(forEachIteration, doc);
    }, function(err) {
      return callback(err || forEachEnd);
    });
  };

  // We don't want to pass the listIndexes's cursor directly.
  delete operations.listIndexes;
  operations['listIndexes.toArray'] = function() {
    var args = Array.prototype.slice.call(arguments, 0);
    var callback = args.pop();
    mongodb.Collection.prototype.listIndexes.apply(this, args).toArray(callback);
  };
  operations['listIndexes.forEach'] = function() {
    var args = Array.prototype.slice.call(arguments, 0);
    var callback = args.pop();
    mongodb.Collection.prototype.listIndexes.apply(this, args).forEach(function(doc) {
      return callback(forEachIteration, doc);
    }, function(err) {
      return callback(err || forEachEnd);
    });
  };

  RED.nodes.registerType("mongodb2", function Mongo2ConfigNode(n) {
    RED.nodes.createNode(this, n);
    this.hostname = n.hostname;
    this.port = n.port;
    this.db = n.db;
    this.name = n.name;
    this.parallelism = n.parallelism * 1;
    var credentials = RED.nodes.getCredentials(n.id);
    if (credentials) {
      this.username = credentials.user;
      this.password = credentials.password;
    }
    this.url = url.format({
      "protocol": "mongodb",
      "slashes": true,
      "auth": (this.username?(encodeURIComponent(this.username) + ':' + encodeURIComponent(this.password)):""),
      "hostname": this.hostname,
      "port": this.port,
      "pathname": this.db
    });
    if (!!n.options) {
      try {
        this.options = JSON.parse(n.options);
      } catch (err) {
        this.error("Failed to parse options: " + err);
      }
    }
  });

  RED.httpAdmin.get('/mongodb2/vcap', function(req, res) {
    res.json(services);
  });

  RED.httpAdmin.get('/mongodb2/operations', function(req, res) {
    res.json(Object.keys(operations).sort());
  });

  RED.httpAdmin.get('/mongodb2/:id',function(req, res) {
    var credentials = RED.nodes.getCredentials(req.params.id);
    if (credentials) {
      res.json({
        user: credentials.user,
        hasPassword: !!credentials.password
      });
    } else {
      res.json({});
    }
  });

  RED.httpAdmin.delete('/mongodb2/:id', function(req, res) {
    RED.nodes.deleteCredentials(req.params.id);
    res.send(200);
  });

  RED.httpAdmin.post('/mongodb2/:id', function(req, res) {
    var newCreds = req.body;
    var credentials = RED.nodes.getCredentials(req.params.id) || {};
    if (!newCreds.user) {
      delete credentials.user;
    } else {
      credentials.user = newCreds.user;
    }
    if (newCreds.password === "") {
      delete credentials.password;
    } else {
      credentials.password = newCreds.password || credentials.password;
    }
    RED.nodes.addCredentials(req.params.id, credentials);
    res.send(200);
  });

  var mongoPool = {};

  function getClient(config) {
    var poolCell = mongoPool['#' + config.id];
    if (!poolCell) {
      mongoPool['#' + config.id] = poolCell = {
        "instances": 0,
        // es6-promise. A client will be called only once.
        "promise": mongodb.MongoClient.connect(config.url, config.options || {}).then(function(db) {
          return {
            "db": db,
            "queue": [],
            "parallelOps": 0 // current number of operations
          };
        })
      };
    }
    poolCell.instances++;
    return poolCell.promise;
  }

  function closeClient(config) {
    var poolCell = mongoPool['#' + config.id];
    if (!poolCell) {
      return;
    }
    poolCell.instances--;
    if (poolCell.instances === 0) {
      delete mongoPool['#' + config.id];
      poolCell.promise.then(function(client) {
        client.db.close();
      }, function() { // ignore error
        // db-client was not created in the first place.
      });
    }
  }

  RED.nodes.registerType("mongodb2 in", function Mongo2InputNode(n) {
    RED.nodes.createNode(this, n);
    this.configNode = n.configNode;
    this.collection = n.collection;
    this.operation = n.operation;
    if (n.service == "_ext_") {
      // Refer to the config node's id, url, options, parallelism.
      this.config = RED.nodes.getNode(this.configNode);
    } else if (n.service) {
      var configService = appEnv.getService(n.service);
      if (configService) {
        // Only a url is defined.
        this.config = {
          "id": 'service:' + n.service, // different from node-red node ids.
          "url": configService.credentials.url || configService.credentials.uri
        };
      }
    }
    if (!this.config || !this.config.url) {
      this.error("missing mongodb2 configuration");
      return;
    }
    var node = this;
    getClient(this.url).then(function(client) {
      var nodeCollection;
      if (node.collection) {
        nodeCollection = client.db.collection(node.collection);
      }
      var nodeOperation;
      if (node.operation) {
        nodeOperation = operations[node.operation];
      }
      node.on("input", function(msg) {
        if (node.config.parallelism && (node.config.parallelism > 0) && (client.parallelOps >= node.config.parallelism)) {
          // msg cannot be handled right now - push to queue.
          client.queue.push(msg);
          return;
        }
        handleMessage(msg);
      });
      function handleMessage(msg) {
        client.parallelOps += 1;
        var collection = nodeCollection;
        if (!collection && msg.collection) {
          collection = client.db.collection(msg.collection);
        }
        if (!collection) {
          node.error("No collection defined", msg);
          return messageHandlingCompleted();
        }
        var operation = nodeOperation;
        if (!operation && msg.operation) {
          operation = operations[msg.operation];
        }
        if (!operation) {
          node.error("No operation defined", msg);
          return messageHandlingCompleted();
        }

        delete msg.collection;
        delete msg.operation;

        var args = msg.payload;
        if (!Array.isArray(args)) {
          args = [args];
        }
        if (args.length === 0) {
          // All operations can accept one argument (some can accept more).
          // Some operations don't expect a single callback argument.
          args.push(undefined);
        }
        if ((operation.length > 0) && (args.length > operation.length - 1)) {
          // The operation was defined with arguments, thus it may not
          // assume that the last argument is the callback.
          // We must not pass too many arguments to the operation.
          args = args.slice(0, operation.length - 1);
        }
        node.status({
          "fill": "blue",
          "shape": "dot",
          "text": "requesting"
        });
        try {
          operation.apply(collection, args.concat(function(err, result) {
            if (err && (forEachIteration != err) && (forEachEnd != err)) {
              node.status({
                "fill": "red",
                "shape": "ring",
                "text": "error"
              });
              node.error(err, msg);
              return messageHandlingCompleted();
            }
            if (forEachEnd != err) {
              // send msg (when err == forEachEnd, this is just a forEach completion).
              msg.payload = result;
              node.send(msg);
            }
            if (forEachIteration != err) {
              // clear status
              node.status({});
              messageHandlingCompleted();
            }
          }));
        } catch(err) {
          node.status({
            "fill": "red",
            "shape": "ring",
            "text": "error"
          });
          node.error(err, msg);
          return messageHandlingCompleted();
        }
      }
      function messageHandlingCompleted() {
        // Asynchronous - prevent recursion overflow.
        setImmediate(function() {
          if (client.queue.length > 0) {
            return handleMessage(client.queue.shift());
          }
          if (client.parallelOps <= 0) {
            return node.error("Something went wrong with node-red-contrib-mongodb2 parallel-ops count");
          }
          client.parallelOps -= 1;
        });
      }
    }, function(err) {
      // Failed to create db client
      node.error(err);
    });
    this.on("close", function() {
      if (this.config) {
        closeClient(this.config);
      }
    });
  });
};
