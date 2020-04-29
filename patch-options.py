"""Patch dfmt-specific properties into package.json"""


def camelcase(s):
    ss = ""
    i = 0
    while i < len(s):
        c = s[i]
        if c == "_":
            ss += s[i + 1].upper()
            i += 1
        else:
            ss += c
        i += 1
    return ss


import re


def gen_config(raw_options, description):
    if raw_options == "**`true`**, `false`":
        config = {
            "type": "boolean",
            "default": True,
        }
    elif raw_options == "`true`, **`false`**":
        config = {
            "type": "boolean",
            "default": False,
        }
    elif "integer" in raw_options:
        config = {
            "type": "number",
            "default": re.search(r"\d+", raw_options)[0],
        }
    else:
        config = {
            "type": "string",
            "enum": re.findall("`(\w+)`", raw_options),
            "default": re.search(r"\*\*\`(\w+)`\*\*", raw_options)[1],
        }
    config["scope"] = "resource"
    config["description"] = description
    return config

TARGET_FILE = "package.json"

if __name__ == "__main__":
    import requests, json

    res = requests.get(
        "https://raw.githubusercontent.com/dlang-community/dfmt/master/README.md"
    )
    assert res.ok, "Request failed"
    match = re.search(
        r"### dfmt-specific properties.*?--\n(.*?)\n\n", res.text, re.DOTALL
    )  # Get the bottom table
    assert match, "dfmt README.md changed too much"

    package_json = json.load(open(TARGET_FILE))

    properties = package_json["contributes"]["configuration"]["properties"]

    for line in match[1].split("\n"):
        tokens = line.split("|")
        assert len(tokens) == 3, "This column has fewer elements?"
        
        switch_name, raw_options, description = map(str.strip, tokens)
        
        x = switch_name.split(" ", 1)
        if len(x) > 1:
            switch_name = x[0]
            description += " " + x[1]
        if switch_name.startswith("dfmt_"):
            switch_name = switch_name[5:]
        switch_name = "dfmt." + camelcase(switch_name)

        if switch_name not in properties:
            properties[switch_name] = {}
        properties[switch_name].update(gen_config(raw_options, description))

    json.dump(package_json, open(TARGET_FILE, 'w'), indent='\t')