# AKS Store Demo

This sample demo app consists of a group of containerized microservices that can be easily deployed into a Kubernetes cluster. This is meant to show a realistic scenario using a polyglot architecture, event-driven design, and common open source back-end services (eg - RabbitMQ, DocumentDB).

This application is inspired by another demo app called [Red Dog](https://github.com/Azure/reddog-code).

> [!NOTE]
> This is not meant to be an example of perfect code to be used in production, but more about showing a realistic application running in Kubernetes.

## Architecture

The application has the following services:

| Service            | Description                                                                          |
| ------------------ | ------------------------------------------------------------------------------------ |
| `makeline-service` | This service handles processing orders from the queue and completing them (Golang)   |
| `order-service`    | This service is used for placing orders (Javascript)                                 |
| `product-service`  | This service is used to perform CRUD operations on products (Rust)                   |
| `store-front`      | Web app for customers to place orders (Vue.js)                                       |
| `store-admin`      | Web app used by store employees to view orders in queue and manage products (Vue.js) |
| `virtual-customer` | Simulates order creation on a scheduled basis (Rust)                                 |
| `virtual-worker`   | Simulates order completion on a scheduled basis (Rust)                               |
| `documentdb`       | DocumentDB instance for persisted data                                               |
| `rabbitmq`         | RabbitMQ for an order queue                                                          |

![Logical Application Architecture Diagram](assets/demo-arch.png)

## Run on Kubernetes

This application uses public images stored in GitHub Container Registry (GHCR). Once your Kubernetes cluster of choice is setup, you can deploy the full app with the below commands.

```bash
kubectl create ns pets

kubectl apply -f https://raw.githubusercontent.com/Azure-Samples/aks-store-demo/main/aks-store-all-in-one.yaml -n pets
```

## Run the app locally

The application is designed to be [run in a Kubernetes cluster](#run-on-kubernetes), but can also be run locally using Docker Compose.

> [!TIP]
> You must have [Docker Desktop](https://www.docker.com/products/docker-desktop) installed to run this app locally. If you do not have it installed locally, you can try opening this repo in a [GitHub Codespace instead](#run-the-app-with-github-codespaces)

To run this app locally:

Clone the repo to your development computer and navigate to the directory:

```console
git clone https://github.com/Azure-Samples/aks-store-demo.git
cd aks-store-demo
```

Start the app using `docker compose`. For example:

```bash
docker compose up
```

To stop the app, you can hit the `CTRL+C` key combination in the terminal window where the app is running.

## Run the app with GitHub Codespaces

This repo also includes [DevContainer configuration](./.devcontainer/devcontainer.json), so you can open the repo using [GitHub Codespaces](https://docs.github.com/en/codespaces/overview). This will allow you to run the app in a container in the cloud, without having to install Docker on your local machine. When the Codespace is created, you can run the app using the same instructions as above.

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://github.com/codespaces/new?hide_repo_select=true&ref=main&repo=648726487)
