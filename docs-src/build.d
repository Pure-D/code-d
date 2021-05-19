#!/usr/bin/env rdmd

import std;

void main(string[] args)
{
	foreach (f; dirEntries(".", SpanMode.shallow))
	{
		if (!f.name.endsWith(".md"))
			continue;

		auto name = baseName(f);
		auto output = File(chainPath("..", "docs", name), "wb");
		auto input = File(f, "rb");

		output.write("<!-- Documentation generated from docs-src/", name, " -->\n\n");

		int lineNo;
		foreach (line; input.byLine(KeepTerminator.yes))
		{
			lineNo++;
			if (line.startsWith("#include"))
			{
				output.write("<!-- ", line.strip, " -->\n\n");

				auto imp = line["#include".length .. $].strip;
				auto src = File(chainPath("include", imp), "rb");
				foreach (c; src.byChunk(4096))
					output.rawWrite(c);
			}
			else if (line.startsWith("#menu"))
			{
				auto src = File(chainPath("include", "menu.md"), "rb");
				output.writeln(`<div style="float: right; margin-left: 1em; padding: 1em; border: 1px solid white; position: relative; z-index: 10; outline: 1px solid black;">`);
				output.writeln();
				foreach (l; src.byLine)
				{
					// condense
					if (!l.length)
						continue;

					if (l.endsWith(name.format!"(%s)"))
					{
						auto link = l.indexOf('[');
						assert(link != -1);
						output.writeln(l[0 .. link], "**", l[link .. $], "**");
					}
					else
						output.writeln(l);
				}
				output.writeln();
				output.writeln(`</div>`);
			}
			else
			{
				lintLinks(line, name, lineNo);
				output.rawWrite(line);
			}
		}
	}
}

void lintLinks(const(char)[] line, const(char)[] src, int lineNo)
{
	ptrdiff_t last;
	while (true)
	{
		auto i = line.indexOf(')', last);
		if (i == -1)
			break;
		auto start = line.lastIndexOf('(', i);
		if (start <= 0)
			break;
		auto content = line[start + 1 .. i];

		if (!content.startsWith("http:", "https:", "data:", "command:", "/") && line[start - 1] == ']')
		{
			auto hash = content.indexOf('#');
			if (hash != -1)
				content = content[0 .. hash];

			if (content.length && !exists(content) && !exists(chainPath("..", "docs", content)))
			{
				stderr.writeln("Warning: dead link in ", src, ":", lineNo, ": ", content);
			}
		}

		last = i + 1;
	}
}
