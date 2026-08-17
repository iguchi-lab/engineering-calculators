from pathlib import Path


TEMPLATE = (Path(__file__).parents[1] / "template-deploy.yaml").read_text(encoding="utf-8")


def test_unsafe_eval_is_scoped_to_mollier_policy():
    assert TEMPLATE.count("'unsafe-eval'") == 1
    assert "MollierSecurityHeadersPolicy:" in TEMPLATE
    assert "PathPattern: /mollier/*" in TEMPLATE
    assert "ResponseHeadersPolicyId: !Ref MollierSecurityHeadersPolicy" in TEMPLATE


def test_default_policy_does_not_allow_dynamic_code_execution():
    default_policy = TEMPLATE.split("MollierSecurityHeadersPolicy:", maxsplit=1)[0]
    assert "'unsafe-eval'" not in default_policy
    assert "'wasm-unsafe-eval'" not in default_policy
