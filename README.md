# node-red-contrib-mongodb2
MongoDB 2 driver node for Node-RED

Inspired from [node-red-bluemix-nodes](https://github.com/node-red/node-red-bluemix-nodes/tree/master/mongo) and [MongoDB 2 Driver](http://mongodb.github.io/node-mongodb-native/2.0)

Please refer to the [Collection documentation](http://mongodb.github.io/node-mongodb-native/2.0/api/Collection.html) to read about each operation. To pass multiple parameters to an operation fill `msg.payload` with an array (do not include the last callback parameter).

## Changes From 0.0.7
*** Options *** -
Allowing to pass options to [MongoClient.connect](http://mongodb.github.io/node-mongodb-native/2.0/api/MongoClient.html#.connect). Since there are many possible options, and there may be even more in the future, these extra options are simply passed as a JSON in a text-field.

*** Parallelism Limit *** - Sending a lot of commands in a short time to the underlying mongodb-native driver, without waiting for their response, may cause serious problems and slow down the whole app. This has probably something to do with the connection sockets being clogged and their cache getting filled.
This option allows to limit the number of operations that are sent before getting a response. For example, if the parallelism-limit is set to 5 and we are making 7 operations in a short period of time, the first 5 operations will start immediately, but the 6th and 7th operations will wait in a queue. The 6th operation will start only when one of the first 5 operations has finished. Similarly, the 7th operation will start only when another operation has finished.
