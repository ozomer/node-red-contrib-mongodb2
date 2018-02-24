/**
* Copyright 2018 Awear Solutions Ltd.
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
  const EventEmitter = require('events').EventEmitter;
  const appEnv = require('cfenv').getAppEnv();
  const mongodb = require('mongodb');
  const forEachIteration = new Error("node-red-contrib-mongodb3 forEach iteration");
  const forEachEnd = new Error("node-red-contrib-mongodb3 forEach end");

  let services = [];
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

  const operations = {};
  Object.keys(mongodb.Collection.prototype).forEach(function(operationName) {
    if ('function' == typeof Object.getOwnPropertyDescriptor(mongodb.Collection.prototype, operationName).value) {
      operations[operationName] = mongodb.Collection.prototype[operationName];
    }
  });
  // We don't want to pass the find-operation's cursor directly.
  delete operations.find;

  operations['find.toArray'] = function() {
    const args = Array.prototype.slice.call(arguments, 0);
    const callback = args.pop();
    mongodb.Collection.prototype.find.apply(this, args).toArray(callback);
  };
  operations['find.forEach'] = function() {
    const args = Array.prototype.slice.call(arguments, 0);
    const callback = args.pop();
    mongodb.Collection.prototype.find.apply(this, args).forEach(function(doc) {
      return callback(forEachIteration, doc);
    }, function(err) {
      return callback(err || forEachEnd);
    });
  };

  // We don't want to pass the aggregate's cursor directly.
  delete operations.aggregate;
  operations['aggregate.toArray'] = function() {
    const args = Array.prototype.slice.call(arguments, 0);
    const callback = args.pop();
    mongodb.Collection.prototype.aggregate.apply(this, args).toArray(callback);
  };
  operations['aggregate.forEach'] = function() {
    const args = Array.prototype.slice.call(arguments, 0);
    const callback = args.pop();
    mongodb.Collection.prototype.aggregate.apply(this, args).forEach(function(doc) {
      return callback(forEachIteration, doc);
    }, function(err) {
      return callback(err || forEachEnd);
    });
  };

  // We don't want to pass the listIndexes's cursor directly.
  delete operations.listIndexes;
  operations['listIndexes.toArray'] = function() {
    const args = Array.prototype.slice.call(arguments, 0);
    const callback = args.pop();
    mongodb.Collection.prototype.listIndexes.apply(this, args).toArray(callback);
  };
  operations['listIndexes.forEach'] = function() {
    const args = Array.prototype.slice.call(arguments, 0);
    const callback = args.pop();
    mongodb.Collection.prototype.listIndexes.apply(this, args).forEach(function(doc) {
      return callback(forEachIteration, doc);
    }, function(err) {
      return callback(err || forEachEnd);
    });
  };

  operations.db = function(callback) {
    return callback(null, this);
  };

  operations.collection = function(callback) {
    return callback(null, this);
  };

  RED.nodes.registerType("mongodb3", function MongoConfigNode(n) {
    RED.nodes.createNode(this, n);
    this.uri = '' + n.uri;
    if (this.credentials.user || this.credentials.password) {
      this.uri = this.uri.replace(/^mongodb:\/\//, 'mongodb://' + encodeURIComponent(this.credentials.user) + ':' + encodeURIComponent(this.credentials.password) + '@');
    }
    this.name = n.name;
    this.parallelism = n.parallelism * 1;
    if (!!n.options) {
      try {
        this.options = JSON.parse(n.options);
      } catch (err) {
        this.error("Failed to parse options: " + err);
      }
    }
    this.deploymentId = (1 + Math.random() * 0xffffffff).toString(16).replace('.', '');
  }, {
    "credentials": {
      "user": {
        "type": "text"
      },
      "password": {
        "type": "password"
      }
    }
  });

  RED.httpAdmin.get('/mongodb3/vcap', function(req, res) {
    res.json(services);
  });

  RED.httpAdmin.get('/mongodb3/operations', function(req, res) {
    res.json(Object.keys(operations).sort());
  });

  const mongoPool = {};

  function getClient(config) {
    let poolCell = mongoPool['#' + config.deploymentId];
    if (!poolCell) {
      mongoPool['#' + config.deploymentId] = poolCell = {
        "instances": 0,
        // es6-promise. A client will be called only once.
        "promise": mongodb.MongoClient.connect(config.uri, config.options || {}).then(function(client) {
          const dbName = decodeURIComponent((config.uri.match(/^.*\/([^?]*)\??.*$/) || [])[1] || '');
          const db = client.db(dbName);
          return {
			      "client": client,
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
    const poolCell = mongoPool['#' + config.deploymentId];
    if (!poolCell) {
      return;
    }
    poolCell.instances--;
    if (poolCell.instances === 0) {
      delete mongoPool['#' + config.deploymentId];
      poolCell.promise.then(function(client) {
        client.client.close().catch(function(err) {
          node.error("Error while closing client: " + err);
        });
      }, function() { // ignore error
        // db-client was not created in the first place.
      });
    }
  }

  RED.nodes.registerType("mongodb3 in", function MongoInputNode(n) {
    RED.nodes.createNode(this, n);
    this.configNode = n.configNode;
    this.collection = n.collection;
    this.operation = n.operation;
    if (n.service == "_ext_") {
      // Refer to the config node's id, uri, options, parallelism and warn function.
      this.config = RED.nodes.getNode(this.configNode);
    } else if (n.service) {
      const configService = appEnv.getService(n.service);
      if (configService) {
        // Only a uri is defined.
        this.config = {
          "deploymentId": 'service:' + n.service, // different from node-red deployment ids.
          "uri": configService.credentials.uri || configService.credentials.url
        };
      }
    }
    if (!this.config || !this.config.uri) {
      this.error("missing mongodb3 configuration");
      return;
    }
    const node = this;
    getClient(node.config).then(function(client) {
      let nodeCollection;
      if (node.collection) {
        nodeCollection = client.db.collection(node.collection);
      }
      let nodeOperation;
      if (node.operation) {
        nodeOperation = operations[node.operation];
      }
      node.on('input', function(msg) {
        if (node.config.parallelism && (node.config.parallelism > 0) && (client.parallelOps >= node.config.parallelism)) {
          // msg cannot be handled right now - push to queue.
          client.queue.push({
            "node_id": node.id,
            "msg": msg
          });
          return;
        }
        client.parallelOps += 1;
        setImmediate(function() {
          handleMessage(msg);
        });
      });

      node.on('node-red-contrib-mongodb3 handleMessage', function(msg) {
        // see: messageHandlingCompleted
        setImmediate(function(){
          handleMessage(msg);
        });
      });

      function handleMessage(msg) {
        let operation = nodeOperation;
        if (!operation && msg.operation) {
          operation = operations[msg.operation];
        }
        if (!operation) {
          node.error("No operation defined", msg);
          return messageHandlingCompleted();
        }
        let collection; // stays undefined in the case of "db" operation.
        if (operation != operations.db) {
          collection = nodeCollection;
          if (!collection && msg.collection) {
            collection = client.db.collection(msg.collection);
          }
          if (!collection) {
            node.error("No collection defined", msg);
            return messageHandlingCompleted();
          }
        }

        delete msg.collection;
        delete msg.operation;
        let args = msg.payload;
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
        profiling.requests += 1;
        debounceProfilingStatus();
        try {
          operation.apply(collection || client.db, args.concat(function(err, response) {
            if (err && (forEachIteration != err) && (forEachEnd != err)) {
              profiling.error += 1;
              debounceProfilingStatus();
              node.error(err, msg);
              return messageHandlingCompleted();
            }
            if (forEachEnd != err) {
              if (!!response) {
                // Some operations return a Connection object with the result.
                // Passing this large connection object might be heavy - it will
                // be cloned over and over by Node-RED, and there is no reason
                // the typical user will need it.
                // The mongodb package does not export the Connection prototype-function.
                // Instead of loading the Connection prototype-function from the
                // internal libs (which might change their path), I use the fact
                // that it inherits EventEmitter.
                if (response.connection instanceof EventEmitter) {
                  delete response.connection;
                }
                if (response.result && response.result.connection instanceof EventEmitter) {
                  delete response.result.connection;
                }
              }
              // send msg (when err == forEachEnd, this is just a forEach completion).
              if (forEachIteration == err) {
                // Clone, so we can send the same message again with a different payload
                // in each iteration.
                const messageToSend = RED.util.cloneMessage(msg);
                messageToSend.payload = response;
                node.send(messageToSend);
              } else {
                // No need to clone - the same message will not be sent again.
                msg.payload = response;
                node.send(msg);
              }
            }
            if (forEachIteration != err) {
              // clear status
              profiling.success += 1;
              debounceProfilingStatus();
              messageHandlingCompleted();
            }
          }));
        } catch(err) {
          profiling.error += 1;
          debounceProfilingStatus();
          node.error(err, msg);
          return messageHandlingCompleted();
        }
      }
      function messageHandlingCompleted() {
        setImmediate(handlePendingMessageOnDemand);
      }
      function handlePendingMessageOnDemand() {
        while (client.queue.length > 0) {
          const pendingMessage = client.queue.shift();
          const targetNode = RED.nodes.getNode(pendingMessage.node_id);
          if (!targetNode) {
            // The node was removed before handling the pending message.
            // This is just a warning because a similar scenario can happen if
            // a node was removed just before handling a message that was sent
            // to it.
            const warningMessage = "Node " + pendingMessage.node_id + " was removed while having a pending message";
            if (node.config.warn) {
              // The warning will appear from the config node, because the target
              // node cannot be found.
              node.config.warn(warningMessage, pendingMessage.msg);
            } else {
              // If the node was configured with a service instead of a config node,
              // the warning will appear from the current node.
              // This shouldn't happen in real life because in such scenario
              // the parallelism limit is not configured.
              node.warn(warningMessage, pendingMessage.msg);
            }
            continue;
          }
          // Handle the pending message.
          if (!targetNode.emit('node-red-contrib-mongodb3 handleMessage', pendingMessage.msg)) {
            // Safety check - if emit() returned false it means there are no listeners to the event.
            // Was the target node closed?
            // This shouldn't happen normally, but if it does, we must try to handle the next message in the queue.
            const errorMessage = "Node " + pendingMessage.node_id + " could not handle the pending message";
            if (node.config.error) {
              node.config.error(errorMessage, pendingMessage.msg);
            } else {
              node.error(errorMessage, pendingMessage.msg);
            }
            continue;
          }
          // Another message is being handled. The number of parallel ops does not change.
          return;
        }
        // The queue is empty. The number of parallel ops has reduced.
        if (client.parallelOps <= 0) {
          return node.error("Something went wrong with node-red-contrib-mongodb3 parallel-ops count");
        }
        client.parallelOps -= 1;
      }
    }, function(err) {
      // Failed to create db client
      node.error(err);
    });
    const profiling = {
      "requests": 0,
      "success": 0,
      "error": 0
    };
    function profilingStatus() {
      node.status({
        "fill": "yellow",
        "shape": "dot",
        "text": "" + profiling.requests + ", success: " + profiling.success + ", error: " + profiling.error
      });
    }

    let debouncer = null;
    function debounceProfilingStatus() {
      if (debouncer) {
        return;
      }
      // show curent status, create debouncer.
      profilingStatus();
      debouncer = setTimeout(function() {
        profilingStatus(); // should we call only if there was a change?
        debouncer = null;
      }, 1000);
    }
    node.on('close', function() {
      if (node.config) {
        closeClient(node.config);
      }
      node.removeAllListeners('node-red-contrib-mongodb3 handleMessage');
      if (debouncer) {
        clearTimeout(debouncer);
      }
    });
  });
};
