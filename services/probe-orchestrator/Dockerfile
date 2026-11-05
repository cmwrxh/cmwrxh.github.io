FROM golang:1.24-alpine AS build
WORKDIR /src
COPY go.mod ./
COPY main.go ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/probe-orchestrator .

FROM scratch
COPY --from=build /out/probe-orchestrator /probe-orchestrator
EXPOSE 3200
USER 65532:65532
ENTRYPOINT ["/probe-orchestrator"]
