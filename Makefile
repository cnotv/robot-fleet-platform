# One entry point for both setups.
#   Docker Compose: local development and tests (make up, make test)
#   Kubernetes:     same images, orchestrated by Kustomize overlays (make k8s-local)

COMPOSE := docker compose --profile apps --profile sim
K8S_NS  := robot-fleet
LOCAL   := deploy/k8s/overlays/local
IMAGES  := ingestion-service orchestration-api fleet-dashboard simulator

.PHONY: up down logs test k8s-render k8s-local kind-load k8s-forward k8s-down

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
	kubectl -n $(K8S_NS) create configmap demo-fleet \
	  --from-file=hotel-fleet.json=ingestion-service/cmd/simulator/hotel-fleet.json \
	  --dry-run=client -o yaml | kubectl apply -f -
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
