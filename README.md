## Background

This report provides information on storage providers and data replication for a particular client in the Filecoin network. By analyzing this information, you can better understand the health of a particular SP's storage operation.

The results from this report should **only be used as a guide** for analyzing a particular SP. When using this report in conjunction with the individual context of an SP, there could be a completely valid explaination that negates the SP being flagged in the first place. This should be determined on a case by case basis.

If you have any questions or feedback for the cid-checker, you can leave a comment in [cid-tracker-tooling slack channel](https://filecoinproject.slack.com/archives/C042ZBSSGP9) or **open an issue**.

## Triggering the report

this report can be triggered on a specific application in the [filecoin-plus-large-datasets](https://github.com/filecoin-project/filecoin-plus-large-datasets) repo for a specific client application using the following methods:

- **label trigger** - when a label of `state:Approved` is added to the github issue.
- **manually trigger** - add a comment to an application with this tag: `checker:manualTrigger`

# Report Breakdown

all assets for these reports are uploaded to [filplus-checker-assets](https://github.com/data-preservation-programs/filplus-checker-assets/tree/main/filecoin-project/filecoin-plus-large-datasets/issues).

## Storage Provider Distribution

A table showing the distribution of storage providers that have stored data for the client, along with information on the location, total deals sealed, percentage of total deals, unique data stored, and percentage of duplicate deals for each provider.
### Healthy Report

![provider-distribution](assets/provider-distribution.png?raw=true)

### Flagged Report

![provider-distribution-bad](assets/provider-distribution-bad.png?raw=true)

## Deal Data Replication

A table showing the replication of unique data across storage providers, along with information on the size of the unique data, total deals made, number of providers, and deal percentage for each data replication category. In general, a healthy data replication chart would show higher number of data replication counts across providershe towards the right side of the x-axis (colored green). An unhealthy data replication ratio would show a large amount of data on the left side of the x-axis (colored red).

### Healthy Report

![data-replication](assets/data-replication.png?raw=true)

### Flagged Report

![data-replication-bad](assets/data-replication-bad.png?raw=true)

## Shared CIDs

A table showing the provider breakdown and number of CIDs that have been shared across providers. CID sharing can be seen as an unhealthy activity.

### Healthy Report
f
![shared-cids](assets/shared-cids.png?raw=true)

### Flagged Report

![shared-cids-bad](assets/shared-cids-bad.png?raw=true)


## Contributing

We welcome contributions to our project! If you have an idea for a new feature or have found a bug, please follow the steps below to contribute.

## Submitting an Issue

If you have found a bug or have an idea for a new feature, please submit an issue to our issue tracker. Be sure to include the following information:

- A clear, descriptive title
- A description of the problem or feature request
- Steps to reproduce the issue (if applicable)
- Expected behavior
- Actual behavior
- Any relevant code or error messages

## Submitting a Pull Request

If you would like to submit code to fix a bug or add a new feature, please do the following:

1. Fork the repository and create a new branch for your change.
2. Make your changes, including appropriate test cases.
3. Ensure that the test suite passes.
4. Create a pull request, including a clear description of your change and any relevant issues it addresses.

We will review your pull request and may request changes before merging.
