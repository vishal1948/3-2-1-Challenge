$(function () {
  const CAP_LIMITS = { today: 3, weekly: 2, monthly: 1 };

  function showFlash(message, type) {
    const $flash = $("#flash-message");
    $flash
      .removeClass("hidden success error")
      .addClass(type)
      .text(message);
    clearTimeout($flash.data("timer"));
    const timer = setTimeout(() => $flash.addClass("hidden"), 3000);
    $flash.data("timer", timer);
  }

  function updateBadge(listType) {
    const $column = $(`.list-column[data-list="${listType}"]`);
    const count = $column.find(".goal-item").length;
    $column.find(".cap-badge").text(`${count}/${CAP_LIMITS[listType]}`);

    const atCap = count >= CAP_LIMITS[listType];
    $column.find(".goal-input").prop("disabled", atCap);
    $column.find(".add-form button").prop("disabled", atCap);
  }

  function buildGoalItem(listType, item) {
    return $(`
      <li class="goal-item" data-id="${item.id}">
        <span class="goal-title"></span>
        <div class="goal-actions">
          <button class="complete-btn" title="Mark complete">✓</button>
          <button class="delete-btn" title="Delete">✕</button>
        </div>
      </li>
    `).find(".goal-title").text(item.title).end();
  }

  function prependHistory(listType, title, action, historyId) {
    const $empty = $(".history-empty");
    if ($empty.length) $empty.remove();

    const dateStr = new Date().toLocaleDateString();
    const $item = $(`
      <li class="history-item history-${action}" data-id="${historyId}">
        <span class="history-type">${listType}</span>
        <span class="history-title"></span>
        <span class="history-action">${action}</span>
        <span class="history-date">${dateStr}</span>
        <button class="history-delete-btn" title="Remove from history">✕</button>
      </li>
    `);
    $item.find(".history-title").text(title);
    $("#history-list").prepend($item);
  }

  // Add a goal
  $(".add-form").on("submit", function (e) {
    e.preventDefault();
    const $form = $(this);
    const listType = $form.data("list");
    const $input = $form.find(".goal-input");
    const title = $input.val().trim();
    if (!title) return;

    $.ajax({
      url: "/api/add",
      method: "POST",
      contentType: "application/json",
      data: JSON.stringify({ listType, title }),
      success: function (res) {
        if (res.success) {
          $(`#${listType}-list`).append(buildGoalItem(listType, res.item));
          $input.val("");
          updateBadge(listType);
          showFlash("Goal added", "success");
        }
      },
      error: function (xhr) {
        const msg = xhr.responseJSON && xhr.responseJSON.error ? xhr.responseJSON.error : "Failed to add goal";
        showFlash(msg, "error");
      },
    });
  });

  // Complete or delete a goal (event delegation since items are added dynamically)
  $(".lists").on("click", ".complete-btn, .delete-btn", function () {
    const $btn = $(this);
    const $item = $btn.closest(".goal-item");
    const $column = $btn.closest(".list-column");
    const listType = $column.data("list");
    const id = $item.data("id");
    const title = $item.find(".goal-title").text();
    const isComplete = $btn.hasClass("complete-btn");
    const url = isComplete ? "/api/complete" : "/api/delete";
    const action = isComplete ? "completed" : "deleted";

    $.ajax({
      url,
      method: "POST",
      contentType: "application/json",
      data: JSON.stringify({ listType, id }),
      success: function (res) {
        if (res.success) {
          $item.remove();
          updateBadge(listType);
          prependHistory(listType, title, action, res.historyId);
          showFlash(isComplete ? "Goal completed" : "Goal deleted", "success");
        }
      },
      error: function (xhr) {
        const msg = xhr.responseJSON && xhr.responseJSON.error ? xhr.responseJSON.error : "Something went wrong";
        showFlash(msg, "error");
      },
    });
  });

  // Delete a history entry (event delegation for dynamically added items)
  $("#history-list").on("click", ".history-delete-btn", function () {
    const $item = $(this).closest(".history-item");
    const id = $item.data("id");

    $.ajax({
      url: "/api/history/delete",
      method: "POST",
      contentType: "application/json",
      data: JSON.stringify({ id }),
      success: function (res) {
        if (res.success) {
          $item.remove();
          if ($("#history-list .history-item").length === 0) {
            $("#history-list").append('<li class="history-empty">No history yet.</li>');
          }
          showFlash("History entry removed", "success");
        }
      },
      error: function (xhr) {
        const msg = xhr.responseJSON && xhr.responseJSON.error ? xhr.responseJSON.error : "Failed to remove entry";
        showFlash(msg, "error");
      },
    });
  });

  // Initialize badges/disabled state on load
  Object.keys(CAP_LIMITS).forEach(updateBadge);
});
