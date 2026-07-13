package localtrace

import "context"

type Repository interface {
	SaveToolRecord(context.Context, ToolRecord) (Reference, error)
	GetToolRecord(context.Context, string, string) (ToolRecord, error)
	SaveInvocationSummary(context.Context, InvocationSummary) error
	GetInvocationTrace(context.Context, string, string) (InvocationTrace, error)
	FindInvocationTraces(context.Context, Scope) ([]InvocationTrace, error)
}
