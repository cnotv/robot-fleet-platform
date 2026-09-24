FROM golang:1.23-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/ingestion . \
 && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/simulator ./cmd/simulator

FROM gcr.io/distroless/static-debian12:nonroot AS simulator
COPY --from=build /out/simulator /simulator
ENTRYPOINT ["/simulator"]

FROM gcr.io/distroless/static-debian12:nonroot AS runtime
COPY --from=build /out/ingestion /ingestion
EXPOSE 8080
ENTRYPOINT ["/ingestion"]
