import { z } from "zod";
import { protectedProcedure as owner } from "../index";
import {
  deletionInput,
  displayInput,
  libraryQuery,
  noteDelete,
  noteWrite,
  targetInput,
} from "../library-contracts";
import { getDisplay, prepareExport, requestDeletion, saveDisplay } from "../services/account-data";
import * as library from "../services/library";

const page = z
  .object({ page: z.number().int().min(0).max(10000).default(0) })
  .strict()
  .default({ page: 0 });
export const libraryAccountRouter = {
  bookmarks: {
    list: owner
      .input(page)
      .handler(({ context: c, input: i }) =>
        library.listBookmarks(c.db, c.session.user.id, i.page),
      ),
    set: owner
      .input(z.object({ target: targetInput, saved: z.boolean() }).strict())
      .handler(({ context: c, input: i }) =>
        library.setBookmark(c.db, c.session.user.id, i.target, i.saved),
      ),
  },
  search: {
    query: owner
      .input(libraryQuery)
      .handler(({ context: c, input: i }) => library.searchLibrary(c.db, c.session.user.id, i)),
    question: owner
      .input(z.object({ versionId: z.string().min(1).max(100) }).strict())
      .handler(({ context: c, input: i }) =>
        library.getQuestionReview(c.db, c.session.user.id, i.versionId),
      ),
  },
  notes: {
    list: owner
      .input(
        z
          .object({
            page: z.number().int().min(0).max(10000).default(0),
            query: z.string().trim().max(120).default(""),
          })
          .strict()
          .default({ page: 0, query: "" }),
      )
      .handler(({ context: c, input: i }) =>
        library.listPrivateNotes(c.db, c.session.user.id, i.query, i.page),
      ),
    get: owner
      .input(z.object({ target: targetInput }).strict())
      .handler(({ context: c, input: i }) =>
        library.getPrivateNote(c.db, c.session.user.id, i.target),
      ),
    save: owner
      .input(noteWrite)
      .handler(({ context: c, input: i }) =>
        library.savePrivateNote(
          c.db,
          c.session.user.id,
          i.target,
          i.body,
          i.revision,
          i.mutationId,
        ),
      ),
    delete: owner
      .input(noteDelete)
      .handler(({ context: c, input: i }) =>
        library.savePrivateNote(c.db, c.session.user.id, i.target, null, i.revision, i.mutationId),
      ),
  },
  account: {
    settings: owner.handler(({ context: c }) => getDisplay(c.db, c.session.user.id)),
    updateSettings: owner
      .input(displayInput)
      .handler(({ context: c, input: i }) => saveDisplay(c.db, c.session.user.id, i)),
    export: owner.handler(({ context: c }) => prepareExport(c.db, c.session.user.id)),
    requestDeletion: owner
      .input(deletionInput)
      .handler(({ context: c, input: i }) =>
        requestDeletion(c.db, c.session.user.id, c.session.session.id, i.password),
      ),
  },
};
