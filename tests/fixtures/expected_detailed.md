## DataCap and CID Checker Report[^1]
 - Organization: `org1`
 - Client: `f12345`
### Approvers
`1`user1<br/>`1`user2<br/>`1`user3

### Other Addresses[^2]
 - [fxxxx2](https://filfox.info/en/address/fxxxx2) - [org3](url3)


### Storage Provider Distribution
The below table shows the distribution of storage providers that have stored data for this client.

If this is the first time a provider takes verified deal, it will be marked as `new`.

For most of the datacap application, below restrictions should apply.
 - Storage provider should not exceed 25% of total datacap.
 - Storage provider should not be storing duplicate data for more than 20%.
 - Storage provider should have published its public IP address.
 - All storage providers should be located in different regions.

⚠️ [provider0](https://filfox.info/en/address/provider0) has sealed 36.36% of total datacap.

⚠️ 75.00% of total deal sealed by [provider0](https://filfox.info/en/address/provider0) are duplicate data.

⚠️ [provider0](https://filfox.info/en/address/provider0) has unknown IP location.

⚠️ 50.00% of total deal sealed by [provider5](https://filfox.info/en/address/provider5) are duplicate data.

⚠️ [provider5](https://filfox.info/en/address/provider5) has unknown IP location.

⚠️ [provider1](https://filfox.info/en/address/provider1) has unknown IP location.

| Provider                                                    |                         Location | Total Deals Sealed | Percentage | Unique Data | Duplicate Deals |
| :---------------------------------------------------------- | -------------------------------: | -----------------: | ---------: | ----------: | --------------: |
| [provider0](https://filfox.info/en/address/provider0)`new`  |            Unknown<br/>`Unknown` |           400.00 B |     36.36% |    100.00 B |          75.00% |
| [provider5](https://filfox.info/en/address/provider5)`new`  |            Unknown<br/>`Unknown` |           200.00 B |     18.18% |    100.00 B |          50.00% |
| [provider2](https://filfox.info/en/address/provider2)`new`  | city1, region1, US<br/>`Unknown` |           100.00 B |      9.09% |    100.00 B |           0.00% |
| [provider4](https://filfox.info/en/address/provider4)`new`  | city2, region2, US<br/>`Unknown` |           100.00 B |      9.09% |    100.00 B |           0.00% |
| [provider6](https://filfox.info/en/address/provider6)`new`  | city3, region3, US<br/>`Unknown` |           100.00 B |      9.09% |    100.00 B |           0.00% |
| [provider3](https://filfox.info/en/address/provider3)`new`  | city4, region4, US<br/>`Unknown` |           100.00 B |      9.09% |    100.00 B |           0.00% |
| [provider1](https://filfox.info/en/address/provider1)`new`  |            Unknown<br/>`Unknown` |           100.00 B |      9.09% |    100.00 B |           0.00% |

<img src="./retrieval.png"/>

### Deal Data Replication
The below table shows how each many unique data are replicated across storage providers.

- No more than 25% of unique data are stored with less than 4 providers.

⚠️ 63.64% of deals are for data replicated across less than 4 storage providers.

| Unique Data Size | Total Deals Made | Number of Providers | Deal Percentage |
| ---------------: | ---------------: | ------------------: | --------------: |
|         300.00 B |         700.00 B |                   1 |          63.64% |
|         100.00 B |         400.00 B |                   4 |          36.36% |

<img src="./provider.png"/>

### Deal Data Shared with other Clients[^3]
The below table shows how many unique data are shared with other clients.
Usually different applications owns different data and should not resolve to the same CID.

However, this could be possible if all below clients use same software to prepare for the exact same dataset or they belong to a series of LDN applications for the same dataset.

⚠️ CID sharing has been observed.

| Other Client                                    | Application  | Total Deals Affected | Unique CIDs | Approvers                          |
| :---------------------------------------------- | :----------- | -------------------: | ----------: | :--------------------------------- |
| [fxxxx3](https://filfox.info/en/address/fxxxx3) | [org2](url2) |             200.00 B |           2 | `1`usera<br/>`1`userb<br/>`1`userc |

[^1]: To manually trigger this report, add a comment with text `checker:manualTrigger`

[^2]: Deals from those addresses are combined into this report as they are specified with `checker:manualTrigger`

[^3]: To manually trigger this report with deals from other related addresses, add a comment with text `checker:manualTrigger <other_address_1> <other_address_2> ...`
