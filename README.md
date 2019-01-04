# node-red-contrib-mongodb3
MongoDB node driver 3.0 interface for Node-RED

based on [node-red-bluemix-nodes](https://github.com/node-red/node-red-bluemix-nodes/tree/master/mongo) and [MongoDB 3 Driver](http://mongodb.github.io/node-mongodb-native/3.0)

Please refer to the [mongoDB node driver 'Collection' documentation](http://mongodb.github.io/node-mongodb-native/3.0/api/Collection.html) to read about each operation.

# Usage
**msg.payload** - 
* To pass a single parameter to an operation use `msg.payload` as your parameter (eg `{_id: 1243}`)
* To pass multiple parameters to an operation fill `msg.payload` with an array 
* If you want to pass a single parameter WHICH IS AN ARRAY (eg as with `InserMany`), wrap your array in an outer array: `msg.payload` = `[[{_id: 1243}, {_id: 2345}]]`

Passing the last operation parameter (callbak) is not supported, and will be stripped if provided.

**URI** -
Using a single URI field allows you to specify Host, Port and Database configuration as well as all other features that are supported by the [MongoClient.connect](http://mongodb.github.io/node-mongodb-native/2.1/api/MongoClient.html#.connect), such as Mongos Proxy Connection and Replicaset Server Connection - more information can be found [here](http://mongodb.github.io/node-mongodb-native/2.0/tutorials/connecting).
Notice that the Username & Password fields did remain. They will still be saved as Node-RED credentials (i.e. kept private). If the Username is not empty or the Password is not empty, they will be escaped and added the the URI after the `mongodb://` prefix (separated by ':' and with a '@' after them). You can also leave these fields empty and enter the credentials directly in the URI, following the standard syntax: `mongodb://youruser:yourpassword@host1.yourmongoprovider.com:27017,host2.yourmongoprovider.com:27017/yourdb?replicaSet=foo`. **Do not enter your credentials both in the URI and the Username & Password fields** - this will create an invalid URI such as: `mongodb://youruserfromfield:yourpasswordformfield@youruserfromuri:yourpasswordfromuri@host1.yourmongoprovider.com:27017,host2.yourmongoprovider.com:27017/yourdb?replicaSet=foo`.

**specifying authentication database** - 
most recent deployments of mongoDB store user credentials in a separate databse (usually `admin`) rather than allongside the data in each Db. Therefore you will likley need to provide a `authSource` parameter in your URI
eg: `mongodb://host1.yourmongoprovider.com:27017/yourdb?ssl=true&authSource=admin&replicaSet=foo`

**Parallelism Limit** - Sending a lot of commands in a short time to the underlying mongodb-native driver, without waiting for their response, may cause serious problems and slow down the whole app.
This has probably something to do with the connection sockets being clogged and their cache getting filled.
This option allows to limit the number of operations that are sent before getting a response.
For example, if the parallelism-limit is set to 5 and we are making 7 operations in a short period of time, the first 5 operations will start immediately, but the 6th and 7th operations will wait in a queue.
The 6th operation will start only when one of the first 5 operations has finished.
Similarly, the 7th operation will start only when another operation has finished.

**db & collection operations** - These operations will simply pass the db/collection instance, so they can be used directly (for example, in function nodes).
The db instance is the same one that node-red-contrib-mongodb3 caches and shares between all relevant nodes - if you disconnect it, all the other mongodb3 nodes will fail.
Furthermore, the parallelism-limit does not consider the future operations that you will do with the db/collection instances.
However, if there are many parallel operations, requesting the db/collection will block until some of these operations finish.

# Change Log
## 2.0
BREAKING CHANGES : driver response props are now (correctly) added to message.payload, thus chaning the response shape 
see https://github.com/ozomer/node-red-contrib-mongodb2/issues/34

`1.0` message shape: 
```
msg
|_  payload
     |_ ok
     |_ n
     |_ opTime
     |_ electionId     
     |_ operationTime
     |_ "$clusterTime
```
`2.0` message shape (example for `find()`): 
```
msg
|_  payload
     |_ insertedCount
     |_ ops
     |_ insertedIds      
     |_ result
            |_ ok
            |_ n
            |_ opTime
            |_ electionId
            |_ operationTime
            |_ "$clusterTime

```

## Original creation 1.0.0
MongoDB 3 driver is originally based on [MongoDB 2 driver node for Node-RED](https://www.npmjs.com/package/node-red-contrib-mongodb2), and therefore is placed in the same github repository: (https://github.com/ozomer/node-red-contrib-mongodb2)
The very-similar MongoDB 2 driver is in the same git repository, under the node-red-contrib-mongodb2 branch (not the master branch).

