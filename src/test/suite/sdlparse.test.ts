import * as assert from 'assert';
import * as vscode from 'vscode';
import { parseSDL, tokenizeSDL } from '../../sdl/sdlparse';

let backslash = "\\";

// Defines a Mocha test suite to group tests of similar kind together
suite("sdl parser", () => {
	test("tokenizer", () => {
		let tokens = tokenizeSDL(`my_tag

person "Akiko" "Johnson" height=60

person name:first-name="Akiko" name:last-name="Johnson"
/*
 * Foo
 */
my_namespace:person "Akiko" "Johnson" dimensions:height=68 {
    son "Nouhiro" "Johnson"
    daughter "Sabrina" "Johnson" location="Italy" {
        hobbies "swimming" "surfing"
        smoker false
    }
}   

------------------------------------------------------------------
// (notice the separator style comment above...)

# a log entry
#     note - this tag has two values (date_time and string) and an 
#            attribute (error)
entry 2005/11/23 10:14:23.253-GMT "Something bad happened" error=true

# a long line
mylist "something" "another" true "shoe" 2002/12/13 "rock" ${backslash}
    "morestuff" "sink" "penny" 12:15:23.425

# a long string
text "this is a long rambling line of text with a continuation ${backslash}
   and it keeps going and going..."
   
# anonymous tag examples

files {
    "/folder1/file.txt"
    "/file2.txt"
}
    
# To retrieve the files as a list of strings
#
#     List files = tag.getChild("files").getChildrenValues("content");
# 
# We us the name "content" because the files tag has two children, each of 
# which are anonymous tags (values with no name.)  These tags are assigned
# the name "content"
    
matrix {
    1 2 3
    4 5 6
}`);
		// TODO: make test more automatic instead of relying on tokenizer not changing
		assert.deepStrictEqual(tokens[0], { type: "identifier", range: [0, 6], name: "my_tag" });
	});
	test("example sdl file", () => {
		let root = parseSDL(`# a tag having only a name
420
my_tag

# three tags acting as name value pairs
first_name "Akiko"
last_name "Johnson"
height 68

"anon2"

# a tag with a value list
person "Akiko" "Johnson" 68

# a tag with attributes
person first_name="Akiko" last_name="Johnson" height=68

# a tag with values and attributes
person "Akiko" "Johnson" height=68

# a tag with attributes using namespaces
person name:first-name="Akiko" name:last-name="Johnson"

# a tag with values, attributes, namespaces, and children
my_namespace:person "Akiko" "Johnson" dimensions:height=68 {
    son "Nouhiro" "Johnson"
    daughter "Sabrina" "Johnson" location="Italy" {
        hobbies "swimming" "surfing"
        languages "English" "Italian"
        smoker false
    }
}   

------------------------------------------------------------------
// (notice the separator style comment above...)

# a log entry
#     note - this tag has two values (date_time and string) and an 
#            attribute (error)
entry 2005/11/23 10:14:23.253-GMT "Something bad happened" error=true

# a long line
mylist "something" "another" true "shoe" 2002/12/13 "rock" ${backslash}
    "morestuff" "sink" "penny" 12:15:23.425

# a long string
text "this is a long rambling line of text with a continuation ${backslash}
   and it keeps going and going..."
   
# anonymous tag examples

files {
    "/folder1/file.txt"
    "/file2.txt"
}
    
# To retrieve the files as a list of strings
#
#     List files = tag.getChild("files").getChildrenValues("content");
# 
# We us the name "content" because the files tag has two children, each of 
# which are anonymous tags (values with no name.)  These tags are assigned
# the name "content"
    
matrix {
    1 2 3
    4 5 6
}

# To retrieve the values from the matrix (as a list of lists)
#
#     List rows = tag.getChild("matrix").getChildrenValues("content");`);
		assert.deepStrictEqual(root.tags["my_tag"][0].values.length, 0);
		assert.deepStrictEqual(root.tags["first_name"][0].values.length, 1);
		assert.deepStrictEqual(root.tags["first_name"][0].values[0].value, "Akiko");
		assert.deepStrictEqual(root.tags["last_name"][0].values.length, 1);
		assert.deepStrictEqual(root.tags["last_name"][0].values[0].value, "Johnson");
		assert.deepStrictEqual(root.tags["height"][0].values.length, 1);
		assert.deepStrictEqual(root.tags["height"][0].values[0].value, 68);
		assert.deepStrictEqual(root.tags[""][0].values[0].value, 420);
		assert.deepStrictEqual(root.tags[""][0].values[1].value, "anon2");
		assert.deepStrictEqual(root.tags["person"][0].values.length, 3);
		assert.deepStrictEqual(root.tags["person"][0].values[0].value, "Akiko");
		assert.deepStrictEqual(root.tags["person"][0].values[1].value, "Johnson");
		assert.deepStrictEqual(root.tags["person"][0].values[2].value, 68);
		assert.deepStrictEqual(root.tags["person"][1].values.length, 0);
		assert.deepStrictEqual(root.tags["person"][1].attributes["first_name"][0].value, "Akiko");
		assert.deepStrictEqual(root.tags["person"][1].attributes["last_name"][0].value, "Johnson");
		assert.deepStrictEqual(root.tags["person"][1].attributes["height"][0].value, 68);
		assert.deepStrictEqual(root.tags["person"][2].values.length, 2);
		assert.deepStrictEqual(root.tags["person"][2].values[0].value, "Akiko");
		assert.deepStrictEqual(root.tags["person"][2].values[1].value, "Johnson");
		assert.deepStrictEqual(root.tags["person"][2].attributes["height"][0].value, 68);
		assert.deepStrictEqual(root.tags["person"][3].attributes["first-name"][0].namespace, "name");
		assert.deepStrictEqual(root.tags["person"][3].attributes["first-name"][0].value, "Akiko");
		assert.deepStrictEqual(root.tags["person"][3].attributes["last-name"][0].namespace, "name");
		assert.deepStrictEqual(root.tags["person"][3].attributes["last-name"][0].value, "Johnson");
		assert.deepStrictEqual(root.namespaces["my_namespace"].tags["person"][0].attributes["height"][0].namespace, "dimensions");
		assert.deepStrictEqual(root.namespaces["my_namespace"].tags["person"][0].attributes["height"][0].value, 68);
		assert.deepStrictEqual(root.namespaces["my_namespace"].tags["person"][0].tags["son"][0].values.length, 2);
		assert.deepStrictEqual(root.namespaces["my_namespace"].tags["person"][0].tags["son"][0].values[0].value, "Nouhiro");
		assert.deepStrictEqual(root.namespaces["my_namespace"].tags["person"][0].tags["son"][0].values[1].value, "Johnson");
		assert.deepStrictEqual(root.namespaces["my_namespace"].tags["person"][0].tags["daughter"][0].values.length, 2);
		assert.deepStrictEqual(root.namespaces["my_namespace"].tags["person"][0].tags["daughter"][0].values[0].value, "Sabrina");
		assert.deepStrictEqual(root.namespaces["my_namespace"].tags["person"][0].tags["daughter"][0].values[1].value, "Johnson");
		assert.deepStrictEqual(root.namespaces["my_namespace"].tags["person"][0].tags["daughter"][0].attributes["location"][0].value, "Italy");
		assert.deepStrictEqual(root.namespaces["my_namespace"].tags["person"][0].tags["daughter"][0].tags["hobbies"][0].values.length, 2);
		assert.deepStrictEqual(root.namespaces["my_namespace"].tags["person"][0].tags["daughter"][0].tags["hobbies"][0].values[0].value, "swimming");
		assert.deepStrictEqual(root.namespaces["my_namespace"].tags["person"][0].tags["daughter"][0].tags["hobbies"][0].values[1].value, "surfing");
		assert.deepStrictEqual(root.namespaces["my_namespace"].tags["person"][0].tags["daughter"][0].tags["languages"][0].values.length, 2);
		assert.deepStrictEqual(root.namespaces["my_namespace"].tags["person"][0].tags["daughter"][0].tags["languages"][0].values[0].value, "English");
		assert.deepStrictEqual(root.namespaces["my_namespace"].tags["person"][0].tags["daughter"][0].tags["languages"][0].values[1].value, "Italian");
		assert.deepStrictEqual(root.namespaces["my_namespace"].tags["person"][0].tags["daughter"][0].tags["smoker"][0].values[0].value, false);
		assert.deepStrictEqual(root.tags["entry"][0].values.length, 2);
		assert.deepStrictEqual(root.tags["entry"][0].values[0].value, { year: 2005, month: 11, day: 23, hours: 10, minutes: 14, seconds: 23, milliseconds: 253, timezone: "GMT" });
		assert.deepStrictEqual(root.tags["entry"][0].values[1].value, "Something bad happened");
		assert.deepStrictEqual(root.tags["entry"][0].attributes["error"][0].value, true);
		assert.deepStrictEqual(root.tags["mylist"][0].values.length, 10);
		assert.deepStrictEqual(root.tags["mylist"][0].values[0].value, "something");
		assert.deepStrictEqual(root.tags["mylist"][0].values[1].value, "another");
		assert.deepStrictEqual(root.tags["mylist"][0].values[2].value, true);
		assert.deepStrictEqual(root.tags["mylist"][0].values[3].value, "shoe");
		assert.deepStrictEqual(root.tags["mylist"][0].values[4].value, { year: 2002, month: 12, day: 13 });
		assert.deepStrictEqual(root.tags["mylist"][0].values[5].value, "rock");
		assert.deepStrictEqual(root.tags["mylist"][0].values[6].value, "morestuff");
		assert.deepStrictEqual(root.tags["mylist"][0].values[7].value, "sink");
		assert.deepStrictEqual(root.tags["mylist"][0].values[8].value, "penny");
		assert.deepStrictEqual(root.tags["mylist"][0].values[9].value, { sign: "+", days: undefined, hours: 12, minutes: 15, seconds: 23, milliseconds: 425 });
		assert.deepStrictEqual(root.tags["text"][0].values.length, 1);
		assert.deepStrictEqual(root.tags["text"][0].values[0].value, "this is a long rambling line of text with a continuation and it keeps going and going...");
		assert.deepStrictEqual(root.tags["files"][0].tags[""][0].values.length, 2);
		assert.deepStrictEqual(root.tags["files"][0].tags[""][0].values[0].value, "/folder1/file.txt");
		assert.deepStrictEqual(root.tags["files"][0].tags[""][0].values[1].value, "/file2.txt");
		assert.deepStrictEqual(root.tags["matrix"][0].tags[""][0].values.length, 6);
		assert.deepStrictEqual(root.tags["matrix"][0].tags[""][0].values[0].value, 1);
		assert.deepStrictEqual(root.tags["matrix"][0].tags[""][0].values[1].value, 2);
		assert.deepStrictEqual(root.tags["matrix"][0].tags[""][0].values[2].value, 3);
		assert.deepStrictEqual(root.tags["matrix"][0].tags[""][0].values[3].value, 4);
		assert.deepStrictEqual(root.tags["matrix"][0].tags[""][0].values[4].value, 5);
		assert.deepStrictEqual(root.tags["matrix"][0].tags[""][0].values[5].value, 6);
	});
});