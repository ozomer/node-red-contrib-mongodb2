# node-red-contrib-mongodb2
MongoDB 2 driver node for Node-RED

Inspired from [node-red-bluemix-nodes](https://github.com/node-red/node-red-bluemix-nodes/tree/master/mongo) and [MongoDB 2 Driver](http://mongodb.github.io/node-mongodb-native/2.1)

Please refer to the [Collection documentation](http://mongodb.github.io/node-mongodb-native/2.1/api/Collection.html) to read about each operation.
To pass multiple parameters to an operation fill `msg.payload` with an array (do not include the last callback parameter).

# Change Log

## Changes From 0.4
**Deleting Connection from Op Result** - Some operations return a Connection object in their result:
[deleteWriteOpResult](http://mongodb.github.io/node-mongodb-native/2.1/api/Collection.html#~deleteWriteOpResult),
[insertOneWriteOpResult](http://mongodb.github.io/node-mongodb-native/2.1/api/Collection.html#~insertOneWriteOpResult),
[insertWriteOpResult](http://mongodb.github.io/node-mongodb-native/2.1/api/Collection.html#~insertWriteOpResult),
[updateWriteOpResult](http://mongodb.github.io/node-mongodb-native/2.1/api/Collection.html#~updateWriteOpResult),
[WriteOpResult](http://mongodb.github.io/node-mongodb-native/2.1/api/Collection.html#~WriteOpResult).
This object is large, and used to be cloned each time Node-RED sent the message.
To avoid this, we delete it from the result.
If you find any typical use-case where it is actually needed, please let me know.

## Changes From 0.3
**Profiling Status** - Showing the number of requests, the number of successful responses and the number of errors.
Using a 1-second debounce to avoid changing the status too often.

**Async Handling** - Handle pending messages asynchronously.

## Changes From 0.2
**MongoDB 2.1 Driver** - Replacing the mongodb 2.0 driver.

**URI** -
The Host, Port and Database configuration fields were replaced with a single URI field - allowing more features that are supported by the [MongoClient.connect](http://mongodb.github.io/node-mongodb-native/2.1/api/MongoClient.html#.connect) function, such as Mongos Proxy Connection and Replicaset Server Connection - more information can be found [here](http://mongodb.github.io/node-mongodb-native/2.0/tutorials/connecting).
Notice that the Username & Password fields did remain. They will still be saved as Node-RED credentials (i.e. kept private). If the Username is not empty or the Password is not empty, they will be escaped and added the the URI after the `mongodb://` prefix (separated by ':' and with a '@' after them). You can also leave these fields empty and enter the credentials directly in the URI, following the standard syntax: `mongodb://youruser:yourpassword@host1.yourmongoprovider.com:27017,host2.yourmongoprovider.com:27017/yourdb?replicaSet=foo`. **Do not enter your credentials both in the URI and the Username & Password fields** - this will create an invalid URI such as: `mongodb://youruserfromfield:yourpasswordformfield@youruserfromuri:yourpasswordfromuri@host1.yourmongoprovider.com:27017,host2.yourmongoprovider.com:27017/yourdb?replicaSet=foo`.

## Changes From 0.0.7
**Options** -
Allowing to pass options to [MongoClient.connect](http://mongodb.github.io/node-mongodb-native/2.1/api/MongoClient.html#.connect).
Since there are many possible options, and there may be even more in the future, these extra options are simply passed as a JSON in a text-field.

**Parallelism Limit** - Sending a lot of commands in a short time to the underlying mongodb-native driver, without waiting for their response, may cause serious problems and slow down the whole app.
This has probably something to do with the connection sockets being clogged and their cache getting filled.
This option allows to limit the number of operations that are sent before getting a response.
For example, if the parallelism-limit is set to 5 and we are making 7 operations in a short period of time, the first 5 operations will start immediately, but the 6th and 7th operations will wait in a queue.
The 6th operation will start only when one of the first 5 operations has finished.
Similarly, the 7th operation will start only when another operation has finished.

**New Operations: db, collection** - These operations will simply pass the db/collection instance, so they can be used directly (for example, in function nodes).
The db instance is the same one that node-red-contrib-mongodb2 caches and shares between all relevant nodes - if you disconnect it, all the other mongodb2 nodes will fail.
Furthermore, the parallelism-limit does not consider the future operations that you will do with the db/collection instances.
However, if there are many parallel operations, requesting the db/collection will block until some of these operations finish.
