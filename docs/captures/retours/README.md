# Screenshots an issue points at

An issue that says "this looks wrong" and shows nothing makes the next reader reproduce the
bug before they can even judge it. GitHub's own image upload would do, but it hangs off the
account that dragged the file in; a file committed here is readable by anyone, for as long
as the repository lives, and survives the person who reported it.

One file per symptom, named after the screen and what it shows, referenced from the issue
by its raw URL on `main`. Delete a file when the issue that points at it is closed and the
symptom is gone: this directory holds evidence of open defects, not a gallery.
