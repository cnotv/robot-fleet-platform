# One entry point for every setup.
#   Docker Compose: local development and tests      (make up, make test)
#   Any VM:         Traefik + the platform over SSH    (make vm-proxy, make vm-deploy)
#   Kubernetes:     Kustomize overlays                 (make k8s-local, kubectl apply -k)

COMPOSE := docker compose --profile apps --profile sim
K8S_NS  := robot-fleet
LOCAL   := deploy/k8s/overlays/local
IMAGES  := ingestion-service orchestration-api fleet-dashboard simulator

.PHONY: up down logs test k8s-render k8s-local kind-load k8s-forward k8s-down vm-bootstrap vm-proxy vm-deploy vm-status vm-logs vm-down

up: ## Whole platform with Docker Compose, simulator included
	$(COMPOSE) up --build -d

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f --tail=50

test: ## Unit tests and type checks for every service
	cd ingestion-service && go vet ./... && go test -race ./...
	cd orchestration-api && npm run typecheck && npm test
	cd fleet-dashboard && npm run typecheck

k8s-render: ## Render both overlays; fails on any Kustomize error
	kubectl kustomize $(LOCAL) > /dev/null
	kubectl kustomize deploy/k8s/overlays/production > /dev/null

k8s-local: ## Deploy to the current kubectl context (Docker Desktop, OrbStack, minikube; kind: run make kind-load first)
	$(COMPOSE) build
	kubectl apply -k $(LOCAL)
	kubectl -n $(K8S_NS) rollout status deploy/orchestration-api --timeout=300s
	@echo "Ready. Run make k8s-forward, then open http://localhost:3000"

kind-load: ## Copy the locally built images into a kind cluster
	$(COMPOSE) build
	for image in $(IMAGES); do kind load docker-image robot-fleet-platform-$$image:latest; done

k8s-forward: ## Reach dashboard and API of the local cluster on localhost
	kubectl -n $(K8S_NS) port-forward svc/orchestration-api 4000:4000 & \
	kubectl -n $(K8S_NS) port-forward svc/fleet-dashboard 3000:3000; \
	kill $$!

k8s-down: ## Remove the local deployment, including database volumes
	kubectl delete namespace $(K8S_NS)

# Remote VM. Settings and target host come from deploy/vm/.env (see .env.example).
VM_ENV  := deploy/vm/.env
VM_HOST := $(shell sed -n 's/^DOCKER_HOST=//p' $(VM_ENV) 2>/dev/null)
VM_SSH  := $(patsubst ssh://%,%,$(VM_HOST))
VM_DOCKER := $(if $(VM_HOST),DOCKER_HOST=$(VM_HOST))
VM_PROXY := $(VM_DOCKER) docker compose --env-file $(VM_ENV) -f deploy/vm/compose.traefik.yaml
VM_APP   := $(VM_DOCKER) docker compose --env-file $(VM_ENV) -f docker-compose.yml -f deploy/vm/compose.vm.yaml --profile apps --profile sim

vm-bootstrap: ## Install Docker and a 2 GB swap file on a fresh VM (once)
	ssh $(VM_SSH) 'command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh'
	ssh $(VM_SSH) 'swapon --show | grep -q . || { fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo "/swapfile none swap sw 0 0" >> /etc/fstab; }'

vm-proxy: ## Start or update the shared Traefik proxy on the VM
	$(VM_PROXY) up -d

vm-deploy: ## Pull the images for IMAGE_TAG and start or update the platform on the VM
	$(VM_APP) up -d --remove-orphans

vm-status:
	$(VM_PROXY) ps
	$(VM_APP) ps

vm-logs:
	$(VM_APP) logs -f --tail=50

vm-down: ## Stop the platform on the VM; data volumes are kept
	$(VM_APP) down
