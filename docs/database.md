### MongoDB 7 on Atlas: Setup Guide

**Objective:** Establish a MongoDB 7 cluster on MongoDB Atlas.

#### **Configuration**

- **MongoDB Version:** 7
- **Replica Set:** Deploy a 3-node replica set, automatically distributed across different availability zones for enhanced redundancy.
- **Size Limit:** Keep under 10GB
- **Backup:** scheduled snapshots
- **Environments:** Separate production (`db-aragon-prod`) and development (`db-aragon-dev`) databases.
- **Access Rights:** Configure distinct access levels for production and development environments.
- **Security:** IP whitelisting, SCRAM authentication, role-based access control

#### **Example Connection URIs**

- _DNS Seed List Connection Format_

```plaintext
mongodb+srv://<username>:<password>@your-cluster-hostname/db-aragon-prod?replicaSet=rs0&authSource=admin
```

- _Standard Connection String Format_

```plaintext
mongodb://<username>:<password>@mongo1:27017,mongo2:27017,mongo3:27017/db-aragon-prod?replicaSet=rs0
```
